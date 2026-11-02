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

    /// <summary>What a client's status is, for the lists assigned by status.</summary>
    public record ClientStatus(DateTimeOffset? RegisteredAt, bool HasOrders, bool MidOrder, decimal? LargestOpenOrder);

    /// <summary>Whether a list's statuses take in the client (any one is enough).</summary>
    public static bool Matches(PriceList list, ClientStatus client, DateTimeOffset now)
    {
        if (list.NewClientsAmount is { } amount && client.RegisteredAt is { } registered
            && registered >= Since(now, amount, list.NewClientsUnit))
            return true;
        if (list.ForNoOrders && !client.HasOrders)
            return true;
        if (list.ForMidOrder && client.MidOrder)
            return true;
        return list.OpenOrderAbove is { } above && client.LargestOpenOrder > above;
    }

    private static DateTimeOffset Since(DateTimeOffset now, int amount, string? unit) => unit switch
    {
        Sites.ItemBadges.Day => now.AddDays(-amount),
        Sites.ItemBadges.Month => now.AddMonths(-amount),
        _ => now.AddDays(-7 * amount),
    };

    /// <summary>A price less a general discount, rounded up to a whole shekel and never above the price.</summary>
    public static decimal Discounted(decimal basePrice, decimal percent) =>
        Math.Min(basePrice, Math.Ceiling(basePrice * (100 - percent) / 100));

    /// <summary>
    /// What a list charges for one price of a dish: <paramref name="listPrice"/> is the row's own price within its dates
    /// (null when the list has none then), <paramref name="percent"/> the general discount on that day (null when none).
    /// A row's price that differs from its base is the dish's own discount; <paramref name="rule"/> says which wins
    /// when both apply. Null when the list leaves the price alone.
    /// </summary>
    public static decimal? ListPrice(decimal basePrice, decimal? listPrice, decimal? percent, string rule)
    {
        if (percent is not { } pct)
            return listPrice;
        var general = Discounted(basePrice, pct);
        if (listPrice is not { } own || own == basePrice)
            return general;
        return rule switch
        {
            DiscountRules.General => general,
            DiscountRules.Higher => Math.Min(general, own),
            DiscountRules.Lower => Math.Max(general, own),
            _ => own,
        };
    }

    /// <summary>
    /// The dishes with prices of their own (not hidden, not a variant priced as its main dish), with what
    /// <see cref="SubPricesOf"/> and the admin's lists need loaded, in menu order.
    /// </summary>
    public static async Task<List<Dish>> PricedDishesAsync(AppDbContext db, bool tracking, CancellationToken ct = default)
    {
        var query = db.Dishes.Include(d => d.Options).Include(d => d.Images).Include(d => d.Category)
            .Include(d => d.AddOns).ThenInclude(a => a.AddOnDish).Include(d => d.AddOns).ThenInclude(a => a.Group)
            .Include(d => d.AddOnGroups).AsSplitQuery()
            .Where(d => !d.IsHidden && !(d.UseMainDishPrice && d.MainDishId != null));
        var dishes = await (tracking ? query : query.AsNoTracking()).ToListAsync(ct);
        return dishes.Where(d => RegularMainPrice(d) is not null)
            .OrderBy(d => d.Category?.DisplayOrder ?? int.MaxValue).ThenBy(d => d.DisplayOrder).ThenBy(d => d.Id).ToList();
    }

    /// <summary>
    /// The book for a logged-in client on a day. A dish that a list assigned to the client's phone prices takes the
    /// lowest such price; otherwise the lowest among the lists whose statuses take the client in. A list prices a dish
    /// through its row within the row's dates, and, while its general discount is on, every priced dish (see
    /// <see cref="ListPrice"/>). Each dish brings its winning list's sub-prices. A dish no list prices keeps its regular prices.
    /// </summary>
    public static async Task<PriceBook> ForClientAsync(AppDbContext db, int userId, DateTimeOffset now, DateOnly today, CancellationToken ct = default)
    {
        var user = await db.Users.AsNoTracking().Where(u => u.Id == userId)
            .Select(u => new { u.Phone, u.CreatedAt }).FirstOrDefaultAsync(ct);
        if (user is null)
            return Regular;
        var statusLists = await db.PriceLists.AsNoTracking()
            .Where(l => !l.IsDefault && (l.NewClientsAmount != null || l.ForNoOrders || l.ForMidOrder || l.OpenOrderAbove != null))
            .ToListAsync(ct);
        var forStatus = new HashSet<int>();
        if (statusLists.Count > 0)
        {
            var status = new ClientStatus(
                user.CreatedAt,
                await db.Orders.AnyAsync(o => o.UserId == userId && o.Status != OrderStatus.Cancelled, ct),
                await db.SavedCarts.AnyAsync(c => c.UserId == userId && c.ItemCount > 0, ct),
                await db.Orders.Where(o => o.UserId == userId && o.Status != OrderStatus.Cancelled && o.Status != OrderStatus.Delivered)
                    .MaxAsync(o => (decimal?)o.Total, ct));
            forStatus = statusLists.Where(l => Matches(l, status, now)).Select(l => l.Id).ToHashSet();
        }

        var phone = user.Phone;
        var byPhone = phone is null ? [] : (await db.PriceListPhones.AsNoTracking()
            .Where(p => p.Phone == phone).Select(p => p.PriceListId).ToListAsync(ct)).ToHashSet();
        var lists = await db.PriceLists.AsNoTracking()
            .Where(l => !l.IsDefault && (byPhone.Contains(l.Id) || forStatus.Contains(l.Id))).ToListAsync(ct);
        if (lists.Count == 0)
            return Regular;
        var ids = lists.Select(l => l.Id).ToList();
        var rows = (await db.PriceListDishes.AsNoTracking().Where(d => ids.Contains(d.PriceListId)).ToListAsync(ct))
            .ToLookup(r => r.PriceListId);

        // A general discount reaches dishes the list has no row for, at their base list's prices.
        var discounted = lists.Where(l => l.DiscountActiveOn(today)).ToList();
        var dishes = discounted.Count > 0 ? await PricedDishesAsync(db, tracking: false, ct) : [];
        var baseIds = discounted.Where(l => l.BaseListId is not null).Select(l => l.BaseListId!.Value).Distinct().ToList();
        var baseRows = (await db.PriceListDishes.AsNoTracking().Where(d => baseIds.Contains(d.PriceListId)).ToListAsync(ct))
            .ToLookup(r => r.PriceListId);

        var entries = new List<(int ListId, int DishId, Entry Entry)>();
        foreach (var list in lists)
        {
            var name = list.Name ?? "";
            var own = rows[list.Id].ToDictionary(r => r.DishId);
            if (!list.DiscountActiveOn(today))
            {
                entries.AddRange(own.Values.Where(r => r.IsActiveOn(today)).Select(r => (list.Id, r.DishId, new Entry(r.Price, r.BasePrice, name,
                    (r.SubPrices ?? []).DistinctBy(x => x.Key).ToDictionary(x => x.Key, x => x.Price)))));
                continue;
            }
            var percent = list.DiscountPercent!.Value;
            var fromBase = list.BaseListId is { } baseId ? baseRows[baseId].ToDictionary(r => r.DishId) : [];
            foreach (var dish in dishes)
            {
                var row = own.GetValueOrDefault(dish.Id);
                var active = row is not null && row.IsActiveOn(today);
                var baseRow = fromBase.GetValueOrDefault(dish.Id);
                var basePrice = row?.BasePrice ?? baseRow?.Price ?? RegularMainPrice(dish)!.Value;
                var sub = new Dictionary<string, decimal>();
                foreach (var price in SubPricesOf(dish))
                {
                    var saved = row?.SubPrices?.FirstOrDefault(x => x.Key == price.Key);
                    var subBase = saved?.BasePrice ?? baseRow?.SubPrices?.FirstOrDefault(x => x.Key == price.Key)?.Price ?? price.RegularPrice;
                    sub[price.Key] = ListPrice(subBase, active ? saved?.Price : null, percent, list.DiscountRule)!.Value;
                }
                entries.Add((list.Id, dish.Id, new Entry(ListPrice(basePrice, active ? row!.Price : null, percent, list.DiscountRule)!.Value,
                    basePrice, name, sub)));
            }
        }

        var byDish = entries.GroupBy(e => e.DishId).ToDictionary(g => g.Key, g =>
        {
            // A list for the phone wins over the lists by status.
            var candidates = g.Any(e => byPhone.Contains(e.ListId)) ? g.Where(e => byPhone.Contains(e.ListId)) : g;
            return candidates.OrderBy(e => e.Entry.Price).ThenBy(e => e.ListId).First().Entry;
        });
        return byDish.Count == 0 ? Regular : new PriceBook(byDish);
    }
}
