using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace FoodSite.Api.Orders;

/// <summary>
/// The prices one client gets from price lists (feature <c>priceLists</c>), by the id of the dish that holds them
/// (<see cref="DishRules.Pricing"/>, or the parent of an add-on link): its main price (the default option's, or per unit
/// or kilo) and its sub-prices (its other options, its add-on links' prices and prices above a limit) by key. A dish the
/// book does not hold keeps its regular prices, and so does any price its list row has no entry for. The menu and
/// <see cref="OrderBuilder"/> read prices through it so both price the same way.
/// </summary>
public sealed class PriceBook
{
    /// <summary>What a list gives the dish: the price, the price shown struck through when above it, the list's name, the sub-prices.</summary>
    public record Entry(decimal Price, decimal BasePrice, string ListName, IReadOnlyDictionary<string, decimal> Sub);

    /// <summary>A sub-price of a dish as the admin sees it: what it is (<see cref="SubKinds"/>), whose it is, and its regular price.</summary>
    public record SubPrice(string Key, string Kind, string Name, decimal RegularPrice);

    public static class SubKinds
    {
        public const string Option = "option";
        public const string AddOn = "addOn";
        public const string AddOnOverLimit = "addOnOverLimit";
        public const string GroupOverLimit = "groupOverLimit";
    }

    public static readonly PriceBook Regular = new(new Dictionary<int, Entry>());

    private readonly IReadOnlyDictionary<int, Entry> _byDish;

    public PriceBook(IReadOnlyDictionary<int, Entry> byDish) => _byDish = byDish;

    public static string OptionKey(DishOption option) => $"o:{option.Id}";
    public static string AddOnKey(DishAddOn link) => $"a:{link.AddOnDishId}:{link.Slot}";
    public static string AddOnOverLimitKey(DishAddOn link) => $"ao:{link.AddOnDishId}:{link.Slot}";
    public static string GroupOverLimitKey(AddOnGroup group) => $"g:{group.Id}";

    /// <summary>The list price of a dish that holds its own prices, or null for its regular ones.</summary>
    public Entry? For(Dish pricing) => _byDish.GetValueOrDefault(pricing.Id);

    private decimal? Sub(int dishId, string key) =>
        _byDish.TryGetValue(dishId, out var entry) && entry.Sub.TryGetValue(key, out var price) ? price : null;

    public static DishOption? DefaultOption(Dish pricing) => pricing.Options.FirstOrDefault(o => o.IsDefault) ?? pricing.Options.FirstOrDefault();

    /// <summary>An option's price: the list's main price for the default option, its sub-price for the others.</summary>
    public decimal OptionPrice(Dish pricing, DishOption option) => For(pricing) is { } entry && DefaultOption(pricing)?.Id == option.Id
        ? entry.Price
        : Sub(pricing.Id, OptionKey(option)) ?? option.Price;

    public decimal? UnitPrice(Dish pricing) => For(pricing)?.Price ?? pricing.UnitPrice;

    /// <summary>The list's name when the dish's line is priced from a list: a free amount, the default option, or an option it prices.</summary>
    public string? ListNameFor(Dish pricing, DishOption? option) =>
        For(pricing) is { } entry && (pricing.ChoiceMode == ChoiceMode.Free || DefaultOption(pricing)?.Id == option?.Id
            || (option is not null && entry.Sub.ContainsKey(OptionKey(option)))) ? entry.ListName : null;

    /// <summary>The add-on's price under its parent (null keeps the add-on's own prices); a list can change it, not set one.</summary>
    public decimal? AddOnPrice(DishAddOn link) => link.Price is null ? null : Sub(link.ParentDishId, AddOnKey(link)) ?? link.Price;

    public decimal? AddOnOverLimitPrice(DishAddOn link) =>
        link.OverLimitPrice is null ? null : Sub(link.ParentDishId, AddOnOverLimitKey(link)) ?? link.OverLimitPrice;

    public decimal? GroupOverLimitPrice(AddOnGroup group) =>
        group.OverLimitPrice is null ? null : Sub(group.DishId, GroupOverLimitKey(group)) ?? group.OverLimitPrice;

    /// <summary>The list's name when a price of a parent's link comes from its list.</summary>
    public string? ListNameForSub(int parentDishId, string key) =>
        _byDish.TryGetValue(parentDishId, out var entry) && entry.Sub.ContainsKey(key) ? entry.ListName : null;

    /// <summary>
    /// The main price shown struck through: with a list price, the higher of the admin's price before a discount and the
    /// list's base, when it is above the list price; otherwise the admin's.
    /// </summary>
    public decimal? PriceBeforeDiscount(Dish pricing) => For(pricing) is { } entry
        ? Math.Max(entry.BasePrice, pricing.PriceBeforeDiscount ?? 0) is var before && before > entry.Price ? before : null
        : pricing.PriceBeforeDiscount;

    /// <summary>The regular main price: the default option's, or the price per unit or kilo; null when it has none.</summary>
    public static decimal? RegularMainPrice(Dish pricing) =>
        pricing.ChoiceMode == ChoiceMode.Free ? pricing.UnitPrice : DefaultOption(pricing)?.Price;

    /// <summary>
    /// A dish's sub-prices at their regular prices: its options other than the default (offered options only), then its
    /// own add-on links with a price, a price above the add-on's limit, and its groups with a price above the limit.
    /// Options, AddOns (with AddOnDish) and AddOnGroups must be loaded.
    /// </summary>
    public static IReadOnlyList<SubPrice> SubPricesOf(Dish dish)
    {
        var subs = new List<SubPrice>();
        if (dish.ChoiceMode == ChoiceMode.Fixed && DefaultOption(dish) is { } main)
            subs.AddRange(dish.Options.Where(o => o.Id != main.Id).OrderBy(o => o.Id)
                .Select(o => new SubPrice(OptionKey(o), SubKinds.Option, o.Label, o.Price)));
        foreach (var link in dish.AddOns.Where(a => a.AddOnDish is { IsHidden: false })
            .OrderBy(a => a.Group?.DisplayOrder ?? int.MaxValue).ThenBy(a => a.DisplayOrder).ThenBy(a => a.AddOnDishId).ThenBy(a => a.Slot))
        {
            var name = DishRules.AddOnName(link, link.AddOnDish!);
            if (link.Price is { } price)
                subs.Add(new SubPrice(AddOnKey(link), SubKinds.AddOn, name, price));
            if (link.OverLimitPrice is { } over)
                subs.Add(new SubPrice(AddOnOverLimitKey(link), SubKinds.AddOnOverLimit, name, over));
        }
        subs.AddRange(dish.AddOnGroups.Where(g => g.OverLimitPrice is not null).OrderBy(g => g.DisplayOrder)
            .Select(g => new SubPrice(GroupOverLimitKey(g), SubKinds.GroupOverLimit, g.Name, g.OverLimitPrice!.Value)));
        return subs;
    }

    /// <summary>Sets a sub-price's regular price (the default list); false when the dish has no such price.</summary>
    public static bool SetRegular(Dish dish, string key, decimal price)
    {
        if (dish.Options.FirstOrDefault(o => OptionKey(o) == key) is { } option)
            option.Price = price;
        else if (dish.AddOns.FirstOrDefault(a => a.Price is not null && AddOnKey(a) == key) is { } link)
            link.Price = price;
        else if (dish.AddOns.FirstOrDefault(a => a.OverLimitPrice is not null && AddOnOverLimitKey(a) == key) is { } over)
            over.OverLimitPrice = price;
        else if (dish.AddOnGroups.FirstOrDefault(g => g.OverLimitPrice is not null && GroupOverLimitKey(g) == key) is { } group)
            group.OverLimitPrice = price;
        else
            return false;
        return true;
    }

    /// <summary>
    /// The book for a logged-in client's phone on a day: of the lists assigned to the phone, each dish takes the row with
    /// the lowest main price among the rows in their dates, with that row's sub-prices. A dish no such list prices keeps
    /// its regular prices.
    /// </summary>
    public static async Task<PriceBook> ForPhoneAsync(AppDbContext db, string? phone, DateOnly today, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(phone))
            return Regular;
        var rows = await db.PriceListDishes.AsNoTracking().Include(d => d.PriceList)
            .Where(d => d.PriceList!.Phones.Any(p => p.Phone == phone) && !d.PriceList.IsDefault)
            .ToListAsync(ct);
        var byDish = rows
            .Where(r => r.IsActiveOn(today))
            .GroupBy(r => r.DishId)
            .ToDictionary(g => g.Key, g =>
            {
                var best = g.OrderBy(r => r.Price).ThenBy(r => r.PriceListId).First();
                return new Entry(best.Price, best.BasePrice, best.PriceList!.Name ?? "",
                    (best.SubPrices ?? []).DistinctBy(s => s.Key).ToDictionary(s => s.Key, s => s.Price));
            });
        return byDish.Count == 0 ? Regular : new PriceBook(byDish);
    }
}
