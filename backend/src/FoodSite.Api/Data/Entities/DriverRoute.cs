namespace FoodSite.Api.Data.Entities;

/// <summary>
/// A link the admin sends a driver for one supply day's deliveries (<c>/d/&lt;token&gt;</c>). It opens only its own
/// stops, lets the driver report each one (delivered or not, payment, a photo, a note), and stops working the day
/// after the supply day or when the admin removes it.
/// </summary>
public class DriverRoute
{
    /// <summary>24 random bytes in base64url.</summary>
    public const int TokenLength = 32;
    public const int MaxStops = 100;

    public int Id { get; set; }
    public required string Token { get; set; }
    public DateOnly SupplyDate { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public List<DriverRouteStop> Stops { get; set; } = [];
}

public class DriverRouteStop
{
    public int Id { get; set; }
    public int DriverRouteId { get; set; }
    public DriverRoute? DriverRoute { get; set; }
    public int OrderId { get; set; }
    public Order? Order { get; set; }

    /// <summary>0-based place in the driving order the admin chose.</summary>
    public int Position { get; set; }

    /// <summary>When the admin's report expected the driver at this door.</summary>
    public TimeOnly? PlannedArrival { get; set; }
}
