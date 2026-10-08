namespace FoodSite.Api.Data.Entities;

/// <summary>Site-wide settings. The table holds a single row with <see cref="SingletonId"/>.</summary>
public class Settings
{
    public const int SingletonId = 1;

    public int Id { get; set; } = SingletonId;

    public string? BackgroundImageUrl { get; set; }
    public string? BackgroundImagePublicId { get; set; }

    public bool DeliveryEnabled { get; set; } = true;
    public bool PickupEnabled { get; set; } = true;
    public string? DeliveryAreaText { get; set; }
    public string? DeliveryFeeText { get; set; }

    public string? KashrutText { get; set; }

    /// <summary>The smallest order total (₪) a client may place; null means no minimum.</summary>
    public decimal? MinimumOrderAmount { get; set; }

    /// <summary>Whether <see cref="MinimumOrderAmount"/> applies to pickup orders too, or only to deliveries.</summary>
    public bool MinimumOrderAppliesToPickup { get; set; } = true;

    /// <summary>Phone number for manual Bit/PayBox transfers.</summary>
    public string? PaymentPhone { get; set; }

    /// <summary>
    /// The cities deliveries go to, comma-separated (see <c>ServiceArea</c>). Null until seeded from the
    /// site's <c>site.json</c> on startup; empty means every city is served.
    /// </summary>
    public string? ServiceCities { get; set; }

    /// <summary>
    /// How many orders can be supplied in one hour slot; null means no limit. A full slot can still be picked:
    /// the client is told the admin may call to move it.
    /// </summary>
    public int? OrdersPerHour { get; set; }

    /// <summary>
    /// How many portions can be ordered for one supply date, across all dishes (see <c>DailyPortions</c> for what
    /// counts); null means no limit.
    /// </summary>
    public int? PortionsPerSupplyDate { get; set; }

    public string? AdminPasswordHash { get; set; }

    /// <summary>
    /// Set once the site's <c>site.json</c> → <c>settings</c> defaults were copied in on startup, so a value the
    /// admin clears later is not filled in again.
    /// </summary>
    public bool SiteDefaultsApplied { get; set; }

    // Main contact
    public string? ContactName { get; set; }
    public string? ContactPhone { get; set; }
    public string? ContactAddress { get; set; }
    public string? ContactEmail { get; set; }
    public string? ContactOpeningHours { get; set; }
}
