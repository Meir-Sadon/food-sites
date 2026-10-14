namespace FoodSite.Api.Data.Entities;

/// <summary>
/// An area drawn on the map with the delivery fee for it, or no delivery at all (<see cref="IsBlocked"/>).
/// Used only while <see cref="Settings.DeliveryPricing"/> is <c>zones</c>. Areas can overlap: the one with the
/// lowest <see cref="Priority"/> that holds the address decides, except that a blocked area always wins.
/// </summary>
public class DeliveryZone
{
    public const int NameMaxLength = 60;

    public int Id { get; set; }
    public required string Name { get; set; }

    /// <summary>What a delivery into this area costs; ignored while blocked.</summary>
    public decimal Fee { get; set; }

    /// <summary>No deliveries into this area: a client whose address falls in it cannot send the order.</summary>
    public bool IsBlocked { get; set; }

    /// <summary>Lower numbers are looked at first.</summary>
    public int Priority { get; set; }

    /// <summary>The area's corners as JSON, <c>[[lat, lng], ...]</c>, at least three.</summary>
    public required string PolygonJson { get; set; }
}
