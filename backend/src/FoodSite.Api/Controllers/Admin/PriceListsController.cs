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
    public record PriceListDto(int Id, string? Name, bool IsDefault, int? BaseListId, IReadOnlyList<string> Phones, StatusesDto Statuses);

    /// <summary>
    /// The clients a list is for by status: registered within NewClientsAmount NewClientsUnits (null is off), with no
    /// order that was not cancelled, in the middle of an order, or with an open order above OpenOrderAbove (null is off).
    /// </summary>
    public record StatusesDto(int? NewClientsAmount, string? NewClientsUnit, bool NoOrders, bool MidOrder, decimal? OpenOrderAbove);

    public record PriceListInput(string? Name, int? BaseListId);

    /// <summary>
    /// A dish in a list: its regular main price, and the list's base price, price and dates. InList is false for a dish
    /// added after the list was made (shown at its base list's price until saved). The default list's prices are the
    /// regular ones and have no dates. SubPrices are the dish's other prices (see <see cref="PriceBook.SubPricesOf"/>).
    /// </summary>
    public record PriceListDishDto(
        int DishId, string Name, int CategoryId, string? ImageUrl, decimal RegularPrice,
        decimal BasePrice, decimal Price, DateOnly? From, DateOnly? To, bool InList, IReadOnlyList<SubPriceDto> SubPrices);

    /// <summary>A sub-price in a list. Kind is a <see cref="PriceBook.SubKinds"/> value; Name the option, add-on or group.</summary>
    public record SubPriceDto(string Key, string Kind, string Name, decimal RegularPrice, decimal BasePrice, decimal Price, bool InList);

    /// <summary>SubPrices null keeps the saved ones (a new row takes its base list's).</summary>
    public record PriceListDishInput(
        int DishId, decimal BasePrice, decimal Price, DateOnly? From, DateOnly? To, List<SubPriceInput>? SubPrices = null);

    public record SubPriceInput(string? Key, decimal BasePrice, decimal Price);

    public record DishesInput(List<PriceListDishInput>? Dishes);

    /// <summary>One dish in one list, for the dish's own window: a row per list.</summary>
    public record ListDishDto(PriceListDto List, PriceListDishDto Dish);

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
        var baseRows = await BaseRowsAsync(list.BaseListId);
        var rows = list.Dishes.ToDictionary(d => d.DishId);
        return dishes.Select(d => Row(list, d, rows.GetValueOrDefault(d.Id), baseRows.GetValueOrDefault(d.Id))).ToList();
    }

    /// <summary>One dish in every list, the default list first, for the dish form's price lists window.</summary>
    [HttpGet("dishes/{dishId:int}")]
    public async Task<ActionResult<IReadOnlyList<ListDishDto>>> GetDish(int dishId)
    {
        await EnsureDefaultAsync();
        if ((await PricedDishesAsync(tracking: false)).SingleOrDefault(d => d.Id == dishId) is not { } dish)
            return NotFound();
        var lists = await db.PriceLists.AsNoTracking().Include(l => l.Phones).Include(l => l.Dishes.Where(d => d.DishId == dishId))
            .OrderByDescending(l => l.IsDefault).ThenBy(l => l.Id).ToListAsync();
        PriceListDish? RowOf(int? listId) => lists.SingleOrDefault(l => l.Id == listId)?.Dishes.SingleOrDefault();
        return lists.Select(l => new ListDishDto(ToDto(l), Row(l, dish, l.Dishes.SingleOrDefault(), RowOf(l.BaseListId)))).ToList();
    }

    /// <summary>
    /// Saves the sent dishes' prices. In the default list Price is the dish's regular main price (its default option's,
    /// or per unit) and each sub-price its regular price; the base prices and dates are ignored. In any other list each
    /// sent dish gets its row. With <paramref name="updateLinked"/> a changed price also becomes the base price in the
    /// lists based on this one (and their price too, where it equalled its base).
    /// </summary>
    [HttpPut("{id:int}/dishes")]
    public async Task<ActionResult<IReadOnlyList<PriceListDishDto>>> SaveDishes(int id, DishesInput input, [FromQuery] bool updateLinked = false)
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
            if (!dishes.TryGetValue(row.DishId, out var dish) || sent.Take(i).Any(r => r.DishId == row.DishId))
            {
                errors.Add($"dishes[{i}].dishId", "notFound");
                continue;
            }
            // A list may price a dish at zero. The default list holds the dish's own prices, so there a zero is
            // refused only when it would change one, as the dish form refuses a free option.
            var regular = PriceBook.RegularMainPrice(dish);
            if (row.Price < 0 || row.Price > MaxPrice || (list.IsDefault && row.Price == 0 && regular != 0))
                errors.Add($"dishes[{i}].price", "positive");
            if (!list.IsDefault && (row.BasePrice < 0 || row.BasePrice > MaxPrice))
                errors.Add($"dishes[{i}].basePrice", "positive");
            if (!list.IsDefault && row.From is { } from && row.To is { } to && to < from)
                errors.Add($"dishes[{i}].to", "toBeforeFrom");
            var subs = PriceBook.SubPricesOf(dish).ToDictionary(x => x.Key);
            var subsSent = row.SubPrices ?? [];
            for (var j = 0; j < subsSent.Count; j++)
            {
                var path = $"dishes[{i}].subPrices[{j}]";
                if (subsSent[j].Key is not { } key || !subs.TryGetValue(key, out var sub) || subsSent.Take(j).Any(x => x.Key == key))
                {
                    errors.Add($"{path}.key", "notFound");
                    continue;
                }
                // Any price may be zero in a list; in the default list an option keeps a price unless it already had none.
                bool Bad(decimal value) => value >= MaxPrice || value < 0;
                if (Bad(subsSent[j].Price) || (list.IsDefault && sub.Kind == PriceBook.SubKinds.Option && subsSent[j].Price == 0 && sub.RegularPrice != 0))
                    errors.Add($"{path}.price", "invalid");
                if (!list.IsDefault && Bad(subsSent[j].BasePrice))
                    errors.Add($"{path}.basePrice", "invalid");
            }
        }
        if (errors.Any)
            return Invalid(errors);

        // What the lists based on this one were copied from, to tell which prices changed.
        var before = updateLinked ? (await GetDishes(id)).Value!.ToDictionary(d => d.DishId) : [];

        var baseRows = list.IsDefault ? [] : await BaseRowsAsync(list.BaseListId);
        foreach (var row in sent)
        {
            var dish = dishes[row.DishId];
            var price = decimal.Round(row.Price, 2);
            if (list.IsDefault)
            {
                if (dish.ChoiceMode == ChoiceMode.Free)
                    dish.UnitPrice = price;
                else
                    PriceBook.DefaultOption(dish)!.Price = price;
                foreach (var sub in row.SubPrices ?? [])
                    PriceBook.SetRegular(dish, sub.Key!, decimal.Round(sub.Price, 2));
                continue;
            }
            var saved = list.Dishes.SingleOrDefault(d => d.DishId == row.DishId);
            if (saved is null)
            {
                list.Dishes.Add(saved = new PriceListDish { DishId = row.DishId });
                saved.SubPrices = CopiedSubPrices(dish, baseRows.GetValueOrDefault(dish.Id));
            }
            (saved.BasePrice, saved.Price, saved.From, saved.To) = (decimal.Round(row.BasePrice, 2), price, row.From, row.To);
            if (row.SubPrices is { } subs)
                saved.SubPrices = subs.Select(x => new PriceListSubPrice
                {
                    Key = x.Key!, BasePrice = decimal.Round(x.BasePrice, 2), Price = decimal.Round(x.Price, 2),
                }).ToList();
        }
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        if (updateLinked)
            await UpdateLinkedAsync(list, before, (await GetDishes(id)).Value!.Where(d => sent.Any(r => r.DishId == d.DishId)).ToList());
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
        new(l.Id, l.Name, l.IsDefault, l.BaseListId, l.Phones.Select(p => p.Phone).Order().ToList(),
            new StatusesDto(l.NewClientsAmount, l.NewClientsAmount is null ? null : l.NewClientsUnit, l.ForNoOrders, l.ForMidOrder, l.OpenOrderAbove));

    /// <summary>The statuses the list is for, besides its phones. A list for the client's phone wins over these.</summary>
    [HttpPut("{id:int}/statuses")]
    public async Task<ActionResult<PriceListDto>> SaveStatuses(int id, StatusesDto input)
    {
        var list = await db.PriceLists.Include(l => l.Phones).SingleOrDefaultAsync(l => l.Id == id);
        if (list is null)
            return NotFound();
        if (list.IsDefault)
            return Invalid(nameof(input.NoOrders), "isDefault");
        var errors = new Errors();
        if (input.NewClientsAmount is { } amount)
        {
            if (amount < 1 || amount > ItemBadges.MaxNewAmount)
                errors.Add(nameof(input.NewClientsAmount), "invalid");
            if (input.NewClientsUnit is null || !ItemBadges.Units.Contains(input.NewClientsUnit))
                errors.Add(nameof(input.NewClientsUnit), "invalid");
        }
        if (input.OpenOrderAbove is { } above && (above < 0 || above >= MaxPrice))
            errors.Add(nameof(input.OpenOrderAbove), "invalid");
        if (errors.Any)
            return Invalid(errors);

        list.NewClientsAmount = input.NewClientsAmount;
        list.NewClientsUnit = input.NewClientsAmount is null ? null : input.NewClientsUnit;
        list.ForNoOrders = input.NoOrders;
        list.ForMidOrder = input.MidOrder;
        list.OpenOrderAbove = input.OpenOrderAbove is { } value ? decimal.Round(value, 2) : null;
        await db.SaveChangesAsync();
        return ToDto(list);
    }

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

    /// <summary>Gives the list every priced dish at its base list's current prices, both as its base and its own prices.</summary>
    private async Task CopyBaseAsync(PriceList list)
    {
        var baseRows = await BaseRowsAsync(list.BaseListId);
        list.Dishes.Clear();
        foreach (var dish in await PricedDishesAsync(tracking: false))
        {
            var price = baseRows.GetValueOrDefault(dish.Id)?.Price ?? PriceBook.RegularMainPrice(dish)!.Value;
            list.Dishes.Add(new PriceListDish
            {
                DishId = dish.Id, BasePrice = price, Price = price,
                SubPrices = CopiedSubPrices(dish, baseRows.GetValueOrDefault(dish.Id)),
            });
        }
    }

    /// <summary>The dish's sub-prices as a base list has them (its row's, else the regular ones), as base and price both.</summary>
    private static List<PriceListSubPrice> CopiedSubPrices(Dish dish, PriceListDish? baseRow) =>
        PriceBook.SubPricesOf(dish).Select(sub =>
        {
            var price = baseRow?.SubPrices?.FirstOrDefault(x => x.Key == sub.Key)?.Price ?? sub.RegularPrice;
            return new PriceListSubPrice { Key = sub.Key, BasePrice = price, Price = price };
        }).ToList();

    /// <summary>A base list's own rows by dish (none for the default list, whose prices are the regular ones).</summary>
    private async Task<Dictionary<int, PriceListDish>> BaseRowsAsync(int? baseListId) => baseListId is { } id
        ? await db.PriceListDishes.AsNoTracking().Where(d => d.PriceListId == id).ToDictionaryAsync(d => d.DishId)
        : [];

    /// <summary>The dish as the list shows it: its row, else its base list's prices (the regular ones under the default list).</summary>
    private static PriceListDishDto Row(PriceList list, Dish dish, PriceListDish? row, PriceListDish? baseRow)
    {
        var regular = PriceBook.RegularMainPrice(dish)!.Value;
        var image = dish.Images.OrderBy(i => i.DisplayOrder).Select(i => i.Url).FirstOrDefault();
        var subs = PriceBook.SubPricesOf(dish);
        if (list.IsDefault)
            return new PriceListDishDto(dish.Id, dish.Name, dish.CategoryId, image, regular, regular, regular, null, null, true,
                subs.Select(x => new SubPriceDto(x.Key, x.Kind, x.Name, x.RegularPrice, x.RegularPrice, x.RegularPrice, true)).ToList());

        decimal BaseOf(PriceBook.SubPrice sub) => baseRow?.SubPrices?.FirstOrDefault(x => x.Key == sub.Key)?.Price ?? sub.RegularPrice;
        var fromBase = baseRow?.Price ?? regular;
        if (row is null)
            return new PriceListDishDto(dish.Id, dish.Name, dish.CategoryId, image, regular, fromBase, fromBase, null, null, false,
                subs.Select(x => new SubPriceDto(x.Key, x.Kind, x.Name, x.RegularPrice, BaseOf(x), BaseOf(x), false)).ToList());
        return new PriceListDishDto(dish.Id, dish.Name, dish.CategoryId, image, regular, row.BasePrice, row.Price, row.From, row.To, true,
            subs.Select(x => row.SubPrices?.FirstOrDefault(r => r.Key == x.Key) is { } saved
                ? new SubPriceDto(x.Key, x.Kind, x.Name, x.RegularPrice, saved.BasePrice, saved.Price, true)
                : new SubPriceDto(x.Key, x.Kind, x.Name, x.RegularPrice, BaseOf(x), BaseOf(x), false)).ToList());
    }

    /// <summary>
    /// Makes each changed price of the list the base price in the lists based on it, for the dishes they have rows for;
    /// a price that equalled its base (no discount) moves with it.
    /// </summary>
    private async Task UpdateLinkedAsync(PriceList list, Dictionary<int, PriceListDishDto> before, IReadOnlyList<PriceListDishDto> after)
    {
        var linked = await db.PriceLists.Include(l => l.Dishes)
            .Where(l => list.IsDefault ? !l.IsDefault && l.BaseListId == null : l.BaseListId == list.Id).ToListAsync();
        foreach (var dish in after)
        {
            if (!before.TryGetValue(dish.DishId, out var old))
                continue;
            foreach (var row in linked.SelectMany(l => l.Dishes).Where(r => r.DishId == dish.DishId))
            {
                if (dish.Price != old.Price)
                    (row.BasePrice, row.Price) = (dish.Price, row.Price == row.BasePrice ? dish.Price : row.Price);
                var subs = (row.SubPrices ?? []).ToList();
                foreach (var sub in dish.SubPrices)
                {
                    if (old.SubPrices.FirstOrDefault(x => x.Key == sub.Key) is not { } was || was.Price == sub.Price)
                        continue;
                    var saved = subs.FirstOrDefault(x => x.Key == sub.Key);
                    if (saved is null)
                        subs.Add(new PriceListSubPrice { Key = sub.Key, BasePrice = sub.Price, Price = sub.Price });
                    else
                        (saved.BasePrice, saved.Price) = (sub.Price, saved.Price == saved.BasePrice ? sub.Price : saved.Price);
                }
                // A new list, so the change tracker sees the JSON column change.
                row.SubPrices = subs.Select(x => new PriceListSubPrice { Key = x.Key, BasePrice = x.BasePrice, Price = x.Price }).ToList();
            }
        }
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
    }

    private async Task<List<Dish>> PricedDishesAsync(bool tracking)
    {
        var query = db.Dishes.Include(d => d.Options).Include(d => d.Images).Include(d => d.Category)
            .Include(d => d.AddOns).ThenInclude(a => a.AddOnDish).Include(d => d.AddOns).ThenInclude(a => a.Group)
            .Include(d => d.AddOnGroups).AsSplitQuery()
            .Where(d => !d.IsHidden && !(d.UseMainDishPrice && d.MainDishId != null));
        var dishes = await (tracking ? query : query.AsNoTracking()).ToListAsync();
        return dishes.Where(d => PriceBook.RegularMainPrice(d) is not null)
            .OrderBy(d => d.Category?.DisplayOrder ?? int.MaxValue).ThenBy(d => d.DisplayOrder).ThenBy(d => d.Id).ToList();
    }
}
