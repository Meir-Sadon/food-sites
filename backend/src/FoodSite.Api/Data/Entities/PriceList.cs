namespace FoodSite.Api.Data.Entities;

/// <summary>
/// A price list (feature <c>priceLists</c>): prices for the dishes that apply to the clients it is assigned to, each
/// dish within its own dates. The default list (<see cref="IsDefault"/>) is the dishes' regular prices themselves and
/// has no rows of its own; every other list copied its prices from a base list (the default one, or a list without a
/// base of its own) when it was made or its base changed.
/// </summary>
public class PriceList
{
    public const int NameMaxLength = 60;

    public int Id { get; set; }

    /// <summary>Null for the default list, whose name is the site's text.</summary>
    public string? Name { get; set; }

    public bool IsDefault { get; set; }

    /// <summary>The list this one copied its prices from; null means the default list (and is the default list's own).</summary>
    public int? BaseListId { get; set; }
    public PriceList? BaseList { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    // Clients the list is for by status, besides its phones (any one status is enough; a phone list wins over these).

    /// <summary>Clients who registered within this many <see cref="NewClientsUnit"/>s; null is off.</summary>
    public int? NewClientsAmount { get; set; }

    /// <summary>day, week or month (<c>Sites.ItemBadges.Units</c>).</summary>
    public string? NewClientsUnit { get; set; }

    /// <summary>Clients with no order that was not cancelled.</summary>
    public bool ForNoOrders { get; set; }

    /// <summary>Clients whose order in progress, saved on the server, is not empty (<see cref="SavedCart"/>).</summary>
    public bool ForMidOrder { get; set; }

    /// <summary>Clients with an order not yet delivered or cancelled whose total is above this; null is off.</summary>
    public decimal? OpenOrderAbove { get; set; }

    public bool HasStatuses => NewClientsAmount is not null || ForNoOrders || ForMidOrder || OpenOrderAbove is not null;

    // A discount on the whole menu, off each price's base and rounded up to a whole shekel (Orders.PriceBook.Discounted).

    /// <summary>The percent off; null is no general discount.</summary>
    public decimal? DiscountPercent { get; set; }

    /// <summary>The general discount's dates, both included, either open (like a row's).</summary>
    public DateOnly? DiscountFrom { get; set; }
    public DateOnly? DiscountTo { get; set; }

    /// <summary>Which wins where a dish has a discount of its own: a <see cref="DiscountRules"/> value.</summary>
    public string DiscountRule { get; set; } = DiscountRules.Dish;

    public bool DiscountActiveOn(DateOnly day) =>
        DiscountPercent is not null && (DiscountFrom is null || DiscountFrom <= day) && (DiscountTo is null || DiscountTo >= day);

    public List<PriceListDish> Dishes { get; set; } = [];
    public List<PriceListPhone> Phones { get; set; } = [];
}

/// <summary>Where a dish of a list has a discount of its own and the list a general one, which price the client gets.</summary>
public static class DiscountRules
{
    /// <summary>The general discount.</summary>
    public const string General = "general";
    /// <summary>The dish's own price.</summary>
    public const string Dish = "dish";
    /// <summary>The bigger discount (the lower price).</summary>
    public const string Higher = "higher";
    /// <summary>The smaller discount (the higher price).</summary>
    public const string Lower = "lower";

    public static readonly string[] All = [General, Dish, Higher, Lower];
}

/// <summary>
/// A dish's price in a list: <see cref="Price"/> is what the list's clients pay for the dish's main price (its default
/// option, or its price per unit or kilo). When it is below <see cref="BasePrice"/> the order page shows the base price
/// struck through. The row applies from <see cref="From"/> to <see cref="To"/> (dates in the site's time zone, both
/// included, either open); outside them the dish is priced as if the list did not have it.
/// </summary>
public class PriceListDish
{
    public int Id { get; set; }

    public int PriceListId { get; set; }
    public PriceList? PriceList { get; set; }

    public int DishId { get; set; }
    public Dish? Dish { get; set; }

    public decimal BasePrice { get; set; }
    public decimal Price { get; set; }
    public DateOnly? From { get; set; }
    public DateOnly? To { get; set; }

    /// <summary>
    /// The dish's other prices in the list (its other options, add-on prices and prices above a limit), by
    /// <see cref="Orders.PriceBook"/> key, in the row's dates too. A price the list has no entry for stays regular.
    /// Null on rows saved before sub-prices existed.
    /// </summary>
    public List<PriceListSubPrice>? SubPrices { get; set; } = [];

    public bool IsActiveOn(DateOnly day) => (From is null || From <= day) && (To is null || To >= day);
}

/// <summary>One of a list row's other prices: <see cref="Key"/> names it (see <see cref="Orders.PriceBook"/>).</summary>
public class PriceListSubPrice
{
    public const int KeyMaxLength = 40;

    public required string Key { get; set; }
    public decimal BasePrice { get; set; }
    public decimal Price { get; set; }
}

/// <summary>A client's phone (local form, see <c>PhoneNumber.Normalize</c>) the list is assigned to.</summary>
public class PriceListPhone
{
    public int PriceListId { get; set; }
    public PriceList? PriceList { get; set; }

    public required string Phone { get; set; }
}
