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

    /// <summary>Phone number for manual Bit/PayBox transfers.</summary>
    public string? PaymentPhone { get; set; }

    /// <summary>
    /// The cities deliveries go to, comma-separated (see <c>ServiceArea</c>). Null until seeded from the
    /// site's <c>site.json</c> on startup; empty means every city is served.
    /// </summary>
    public string? ServiceCities { get; set; }

    public string? AdminPasswordHash { get; set; }

    // Main contact
    public string? ContactName { get; set; }
    public string? ContactPhone { get; set; }
    public string? ContactAddress { get; set; }
    public string? ContactEmail { get; set; }
    public string? ContactOpeningHours { get; set; }
}
