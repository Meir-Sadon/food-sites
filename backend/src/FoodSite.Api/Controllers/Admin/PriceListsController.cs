using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Orders;
using FoodSite.Api.Phones;
using FoodSite.Api.Sites;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FoodSite.Api.Controllers.Admin;

/// <summary>
/// Price lists (feature <c>priceLists</c>). The default list is made the first time the lists are asked for and is the
/// dishes' regular prices: editing it changes the dishes. Any other list copies its base list's prices when it is made
/// or its base changes, and then keeps its own, per dish with dates, for the phones assigned to it.
/// </summary>
[Route("api/admin/price-lists")]
[RequireFeature(Features.PriceLists)]
public class PriceListsController(AppDbContext db) : AdminControllerBase
{
    public const decimal MaxPrice = DishesController.MaxAddOnPrice;
    public const int MaxPhones = 1000;

    /// <summary>Name is null for the default list. BaseListId null means the default list (and is the default list's own).</summary>
    public record PriceListDto(int Id, string? Name, bool IsDefault, int? BaseListId, IReadOnlyList<string> Phones);

    public record PriceListInput(string? Name, int? BaseListId);

    /// <summary>
    /// A dish in a list: its regular main price, and the list's base price, price and dates. InList is false for a dish
    /// added after the list was made (shown at its base list's price until saved). The default list's prices are the
    /// regular ones and have no dates.
    /// </summary>
    public record PriceListDishDto(
        int DishId, string Name, int CategoryId, string? ImageUrl, decimal RegularPrice,
        decimal BasePrice, decimal Price, DateOnly? From, DateOnly? To, bool InList);

    public record PriceListDishInput(int DishId, decimal BasePrice, decimal Price, DateOnly? From, DateOnly? To);

    public record DishesInput(List<PriceListDishInput>? Dishes);

    public record PhonesInput(List<string>? Phones);

    [HttpGet]
    public async Task<IReadOnlyList<PriceListDto>> GetAll()
    {
        await EnsureDefaultAsync();
        var lists = await db.PriceLists.AsNoTracking().Include(l => l.Phones)
            .OrderByDescending(l => l.IsDefault).ThenBy(l => l.Id).ToListAsync();
        return lists.Select(ToDto).ToList();
    }

    [HttpPost]
    public async Task<ActionResult<PriceListDto>> Create(PriceListInput input)
    {
        await EnsureDefaultAsync();
        if (await Validate(input, null) is { } invalid)
            return invalid;
        var list = new PriceList { Name = input.Name!.Trim(), BaseListId = await NonDefaultBaseAsync(input.BaseListId) };
        db.PriceLists.Add(list);
        await CopyBaseAsync(list);
        await db.SaveChangesAsync();
        return ToDto(list);
    }

    /// <summary>Renames the list; a new base copies that base's prices over the list's own (the default list keeps its base).</summary>
    [HttpPut("{id:int}")]
    public async Task<ActionResult<PriceListDto>> Update(int id, PriceListInput input)
    {
        var list = await db.PriceLists.Include(l => l.Phones).Include(l => l.Dishes).SingleOrDefaultAsync(l => l.Id == id);
        if (list is null)
            return NotFound();
        if (list.IsDefault)
            return Invalid(nameof(input.Name), "isDefault");
        if (await Validate(input, list) is { } invalid)
            return invalid;

        list.Name = input.Name!.Trim();
        var baseId = await NonDefaultBaseAsync(input.BaseListId);
        if (baseId != list.BaseListId)
        {
            list.BaseListId = baseId;
            await CopyBaseAsync(list);
        }
        await db.SaveChangesAsync();
        return ToDto(list);
    }

    [HttpDelete("{id:int}")]
    public async Task<ActionResult> Remove(int id)
    {
        var list = await db.PriceLists.SingleOrDefaultAsync(l => l.Id == id);
        if (list is null)
            return NotFound();
        if (list.IsDefault)
            return Conflict("isDefault");
        if (await db.PriceLists.AnyAsync(l => l.BaseListId == id))
            return Conflict("isBase");
        db.PriceLists.Remove(list);
        await db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>Every dish that has prices of its own (not removed, not a variant priced like its main dish), in menu order.</summary>
    [HttpGet("{id:int}/dishes")]
    public async Task<ActionResult<IReadOnlyList<PriceListDishDto>>> GetDishes(int id)
    {
        var list = await db.PriceLists.AsNoTracking().Include(l => l.Dishes).SingleOrDefaultAsync(l => l.Id == id);
        if (list is null)
            return NotFound();
        var dishes = await PricedDishesAsync(tracking: false);
        var basePrices = await BasePricesAsync(list.BaseListId);
        var rows = list.Dishes.ToDictionary(d => d.DishId);
        return dishes.Select(d =>
        {
            var regular = PriceBook.RegularMainPrice(d)!.Value;
            var image = d.Images.OrderBy(i => i.DisplayOrder).Select(i => i.Url).FirstOrDefault();
            if (list.IsDefault)
                return new PriceListDishDto(d.Id, d.Name, d.CategoryId, image, regular, regular, regular, null, null, true);
            var fromBase = basePrices.GetValueOrDefault(d.Id, regular);
            return rows.TryGetValue(d.Id, out var row)
                ? new PriceListDishDto(d.Id, d.Name, d.CategoryId, image, regular, row.BasePrice, row.Price, row.From, row.To, true)
                : new PriceListDishDto(d.Id, d.Name, d.CategoryId, image, regular, fromBase, fromBase, null, null, false);
        }).ToList();
    }

    /// <summary>
    /// Saves the sent dishes' prices. In the default list Price is the dish's regular main price (its default option's,
    /// or per unit) and the base price and dates are ignored; in any other list each sent dish gets its row.
    /// </summary>
    [HttpPut("{id:int}/dishes")]
    public async Task<ActionResult<IReadOnlyList<PriceListDishDto>>> SaveDishes(int id, DishesInput input)
    {
        var list = await db.PriceLists.Include(l => l.Dishes).SingleOrDefaultAsync(l => l.Id == id);
        if (list is null)
            return NotFound();
        var sent = input.Dishes ?? [];
        var dishes = (await PricedDishesAsync(tracking: list.IsDefault)).ToDictionary(d => d.Id);

        var errors = new Errors();
        for (var i = 0; i < sent.Count; i++)
        {
            var row = sent[i];
            if (!dishes.ContainsKey(row.DishId) || sent.Take(i).Any(r => r.DishId == row.DishId))
                errors.Add($"dishes[{i}].dishId", "notFound");
            if (row.Price <= 0 || row.Price > MaxPrice)
                errors.Add($"dishes[{i}].price", "positive");
            if (!list.IsDefault && (row.BasePrice <= 0 || row.BasePrice > MaxPrice))
                errors.Add($"dishes[{i}].basePrice", "positive");
            if (!list.IsDefault && row.From is { } from && row.To is { } to && to < from)
                errors.Add($"dishes[{i}].to", "toBeforeFrom");
        }
        if (errors.Any)
            return Invalid(errors);

        foreach (var row in sent)
        {
            var price = decimal.Round(row.Price, 2);
            if (list.IsDefault)
            {
                var dish = dishes[row.DishId];
                if (dish.ChoiceMode == ChoiceMode.Free)
                    dish.UnitPrice = price;
                else
                    PriceBook.DefaultOption(dish)!.Price = price;
                continue;
            }
            var saved = list.Dishes.SingleOrDefault(d => d.DishId == row.DishId);
            if (saved is null)
                list.Dishes.Add(saved = new PriceListDish { DishId = row.DishId });
            (saved.BasePrice, saved.Price, saved.From, saved.To) = (decimal.Round(row.BasePrice, 2), price, row.From, row.To);
        }
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        return await GetDishes(id);
    }

    /// <summary>The whole list of phones the list is for, in any common form; each is kept in its local form, once.</summary>
    [HttpPut("{id:int}/phones")]
    public async Task<ActionResult<PriceListDto>> SavePhones(int id, PhonesInput input)
    {
        var list = await db.PriceLists.Include(l => l.Phones).SingleOrDefaultAsync(l => l.Id == id);
        if (list is null)
            return NotFound();
        if (list.IsDefault)
            return Invalid(nameof(input.Phones), "isDefault");
        var sent = input.Phones ?? [];
        var errors = new Errors();
        if (sent.Count > MaxPhones)
            errors.Add(nameof(input.Phones), "tooManyPhones");
        var phones = new List<string>();
        for (var i = 0; i < sent.Count && !errors.Any; i++)
        {
            if (PhoneNumber.Normalize(sent[i]) is not { } phone)
                errors.Add($"phones[{i}]", "phone");
            else if (!phones.Contains(phone))
                phones.Add(phone);
        }
        if (errors.Any)
            return Invalid(errors);

        list.Phones.RemoveAll(p => !phones.Contains(p.Phone));
        foreach (var phone in phones.Where(p => list.Phones.All(x => x.Phone != p)))
            list.Phones.Add(new PriceListPhone { Phone = phone });
        await db.SaveChangesAsync();
        return ToDto(list);
    }

    private static PriceListDto ToDto(PriceList l) =>
        new(l.Id, l.Name, l.IsDefault, l.BaseListId, l.Phones.Select(p => p.Phone).Order().ToList());

    private async Task EnsureDefaultAsync()
    {
        if (await db.PriceLists.AnyAsync(l => l.IsDefault))
            return;
        db.PriceLists.Add(new PriceList { IsDefault = true });
        await db.SaveChangesAsync();
    }

    /// <summary>The base as stored: null for the default list.</summary>
    private async Task<int?> NonDefaultBaseAsync(int? baseListId) =>
        baseListId is { } id && !await db.PriceLists.AnyAsync(l => l.Id == id && l.IsDefault) ? id : null;

    private async Task<ActionResult?> Validate(PriceListInput input, PriceList? list)
    {
        var errors = new Errors();
        errors.Text(nameof(input.Name), input.Name, PriceList.NameMaxLength, required: true);
        var name = input.Name?.Trim();
        if (!string.IsNullOrEmpty(name) && await db.PriceLists.AnyAsync(l => l.Name == name && l.Id != (list == null ? 0 : list.Id)))
            errors.Add(nameof(input.Name), "duplicate");
        if (input.BaseListId is { } baseId)
        {
            var baseList = await db.PriceLists.AsNoTracking().SingleOrDefaultAsync(l => l.Id == baseId);
            if (baseList is null || baseList.Id == list?.Id)
                errors.Add(nameof(input.BaseListId), "notFound");
            // One level only: a base is the default list or a list without a base, and a list others are based on has none.
            else if (!baseList.IsDefault && (baseList.BaseListId is not null
                || (list is not null && await db.PriceLists.AnyAsync(l => l.BaseListId == list.Id))))
                errors.Add(nameof(input.BaseListId), "baseTooDeep");
        }
        return errors.Any ? Invalid(errors) : null;
    }

    /// <summary>Gives the list every priced dish at its base list's current price, both as its base and its own price.</summary>
    private async Task CopyBaseAsync(PriceList list)
    {
        var basePrices = await BasePricesAsync(list.BaseListId);
        list.Dishes.Clear();
        foreach (var dish in await PricedDishesAsync(tracking: false))
        {
            var price = basePrices.GetValueOrDefault(dish.Id, PriceBook.RegularMainPrice(dish)!.Value);
            list.Dishes.Add(new PriceListDish { DishId = dish.Id, BasePrice = price, Price = price });
        }
    }

    /// <summary>A base list's own prices by dish (empty for the default list, whose prices are the regular ones).</summary>
    private async Task<Dictionary<int, decimal>> BasePricesAsync(int? baseListId) => baseListId is { } id
        ? await db.PriceListDishes.AsNoTracking().Where(d => d.PriceListId == id).ToDictionaryAsync(d => d.DishId, d => d.Price)
        : [];

    private async Task<List<Dish>> PricedDishesAsync(bool tracking)
    {
        var query = db.Dishes.Include(d => d.Options).Include(d => d.Images).Include(d => d.Category)
            .Where(d => !d.IsHidden && !(d.UseMainDishPrice && d.MainDishId != null));
        var dishes = await (tracking ? query : query.AsNoTracking()).ToListAsync();
        return dishes.Where(d => PriceBook.RegularMainPrice(d) is not null)
            .OrderBy(d => d.Category?.DisplayOrder ?? int.MaxValue).ThenBy(d => d.DisplayOrder).ThenBy(d => d.Id).ToList();
    }
}
