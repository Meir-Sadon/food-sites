namespace FoodSite.Api.Data.Entities;

/// <summary>
/// A named group of a dish's add-ons, e.g. "סלטים" under a sandwich: the order page shows the name as a heading, and
/// the client can pick at most <see cref="MaxUnits"/> units from the group (a check box or a weight add-on counts one).
/// </summary>
public class AddOnGroup
{
    public const int NameMaxLength = 50;

    public int Id { get; set; }

    public int DishId { get; set; }
    public Dish? Dish { get; set; }

    public required string Name { get; set; }

    /// <summary>Null means no limit.</summary>
    public int? MaxUnits { get; set; }

    /// <summary>Price per unit for the units above <see cref="MaxUnits"/> (per ordered unit of the parent); null means the limit is firm.</summary>
    public decimal? OverLimitPrice { get; set; }

    public int DisplayOrder { get; set; }

    public List<DishAddOn> AddOns { get; set; } = [];
}
