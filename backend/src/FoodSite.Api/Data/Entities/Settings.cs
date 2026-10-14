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

    /// <summary>SHA-256 (hex) of the console's token (see <c>OpsToken</c>); null while the site has none.</summary>
    public string? OpsTokenHash { get; set; }

    /// <summary>When the master created the current console token.</summary>
    public DateTimeOffset? OpsTokenCreatedAt { get; set; }

    /// <summary>
    /// Set once the site's <c>site.json</c> → <c>settings</c> defaults were copied in on startup, so a value the
    /// admin clears later is not filled in again.
    /// </summary>
    public bool SiteDefaultsApplied { get; set; }

    /// <summary>The look the admin picked (see <c>SiteStyles</c>); null means the site's default.</summary>
    public string? SiteStyle { get; set; }

    /// <summary>Where the order total sits (see <c>OrderLayout</c>); null means the site's default.</summary>
    public string? OrderTotalPosition { get; set; }

    /// <summary>One long page or one category at a time (see <c>OrderLayout</c>); null means the site's default.</summary>
    public string? OrderFlow { get; set; }

    /// <summary>How round the client site's corners are (see <c>Corners</c>); null means the site's default.</summary>
    public string? Corners { get; set; }

    /// <summary>
    /// How delivery is priced: <c>simple</c> (the text in <c>DeliveryFeeText</c>, no fee added) or <c>zones</c> (the
    /// zones the admin drew, see <c>DeliveryZone</c>; only with the <c>deliveryZones</c> feature). Null means simple.
    /// </summary>
    public string? DeliveryPricing { get; set; }

    // Main contact
    public string? ContactName { get; set; }
    public string? ContactPhone { get; set; }
    public string? ContactAddress { get; set; }
    public string? ContactEmail { get; set; }
    public string? ContactOpeningHours { get; set; }

    /// <summary>
    /// Where the business owner is mailed about new orders and changes to the dishes and settings (see <c>OwnerNotifier</c>);
    /// null means no mail.
    /// </summary>
    public string? OwnerEmail { get; set; }
}
