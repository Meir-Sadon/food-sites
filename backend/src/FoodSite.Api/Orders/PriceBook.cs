using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace FoodSite.Api.Orders;

/// <summary>
/// The main prices one client gets from price lists (feature <c>priceLists</c>), by the id of the dish that holds the
/// prices (<see cref="DishRules.Pricing"/>): its default option's price, or its price per unit or kilo. A dish the book
/// does not hold keeps its regular prices, and so does everything else of a dish (its other options and add-on prices).
/// The menu and <see cref="OrderBuilder"/> read prices through it so both price the same way.
/// </summary>
public sealed class PriceBook
{
    /// <summary>What a list gives the dish: the price, the price shown struck through when above it, and the list's name.</summary>
    public record Entry(decimal Price, decimal BasePrice, string ListName);

    public static readonly PriceBook Regular = new(new Dictionary<int, Entry>());

    private readonly IReadOnlyDictionary<int, Entry> _byDish;

    public PriceBook(IReadOnlyDictionary<int, Entry> byDish) => _byDish = byDish;

    /// <summary>The list price of a dish that holds its own prices, or null for its regular ones.</summary>
    public Entry? For(Dish pricing) => _byDish.GetValueOrDefault(pricing.Id);

    public static DishOption? DefaultOption(Dish pricing) => pricing.Options.FirstOrDefault(o => o.IsDefault) ?? pricing.Options.FirstOrDefault();

    /// <summary>An option's price: the list's for the default option, the regular one for the others.</summary>
    public decimal OptionPrice(Dish pricing, DishOption option) =>
        For(pricing) is { } entry && DefaultOption(pricing)?.Id == option.Id ? entry.Price : option.Price;

    public decimal? UnitPrice(Dish pricing) => For(pricing)?.Price ?? pricing.UnitPrice;

    /// <summary>The list's name when the dish's line is priced from a list: its default option, or a free amount.</summary>
    public string? ListNameFor(Dish pricing, DishOption? option) =>
        For(pricing) is { } entry && (pricing.ChoiceMode == ChoiceMode.Free || DefaultOption(pricing)?.Id == option?.Id) ? entry.ListName : null;

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
    /// The book for a logged-in client's phone on a day: of the lists assigned to the phone, each dish takes the lowest
    /// price among the lists whose row for it is in its dates. A dish no such list prices keeps its regular prices.
    /// </summary>
    public static async Task<PriceBook> ForPhoneAsync(AppDbContext db, string? phone, DateOnly today, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(phone))
            return Regular;
        var rows = await db.PriceListDishes.AsNoTracking()
            .Where(d => d.PriceList!.Phones.Any(p => p.Phone == phone) && !d.PriceList.IsDefault)
            .Select(d => new { d.DishId, d.Price, d.BasePrice, d.From, d.To, d.PriceList!.Name, d.PriceListId })
            .ToListAsync(ct);
        var byDish = rows
            .Where(r => (r.From is null || r.From <= today) && (r.To is null || r.To >= today))
            .GroupBy(r => r.DishId)
            .ToDictionary(g => g.Key, g =>
            {
                var best = g.OrderBy(r => r.Price).ThenBy(r => r.PriceListId).First();
                return new Entry(best.Price, best.BasePrice, best.Name ?? "");
            });
        return byDish.Count == 0 ? Regular : new PriceBook(byDish);
    }
}
