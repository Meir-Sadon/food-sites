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

    /// <summary>
    /// The regular delivery setting's fixed fee, added to the total of a delivery to a service city; null means none.
    /// A city outside the service area gets no fee: the owner tells the client the price by phone.
    /// </summary>
    public decimal? DeliveryFeeAmount { get; set; }

    public string? KashrutText { get; set; }

    /// <summary>The smallest order total (₪) a client may place; null means no minimum.</summary>
    public decimal? MinimumOrderAmount { get; set; }

    /// <summary>Whether <see cref="MinimumOrderAmount"/> applies to pickup orders too, or only to deliveries.</summary>
    public bool MinimumOrderAppliesToPickup { get; set; } = true;

    /// <summary>The order page first asks delivery or pickup and the contact and address, then shows the dishes. Off keeps the usual page.</summary>
    public bool AddressFirst { get; set; }

    /// <summary>Phone number for manual Bit/PayBox transfers.</summary>
    public string? PaymentPhone { get; set; }

    /// <summary>The client may choose to pay with Bit (a manual transfer to <see cref="PaymentPhone"/>).</summary>
    public bool BitEnabled { get; set; }

    /// <summary>The client may choose to pay with PayBox (a manual transfer to <see cref="PaymentPhone"/>).</summary>
    public bool PayBoxEnabled { get; set; }

    /// <summary>A payment-request link the owner made in the Bit app (https), shown to a client who pays with Bit.</summary>
    public string? BitLink { get; set; }

    /// <summary>A payment-request link the owner made in the PayBox app (https), shown to a client who pays with PayBox.</summary>
    public string? PayBoxLink { get; set; }

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
    /// zones the admin drew, see <c>DeliveryZone</c>). Null means simple.
    /// </summary>
    public string? DeliveryPricing { get; set; }

    /// <summary>The ready-made colour palette (see <c>Palettes</c>); null means the site's default.</summary>
    public string? Palette { get; set; }

    /// <summary>The admin's own colours per element as a JSON object (see <c>Palettes.ColorKeys</c>); they win over the palette. Null: none.</summary>
    public string? CustomColors { get; set; }

    /// <summary>Thickness in pixels of the lines on the client site (1 to <c>Palettes.MaxLineWidth</c>); null means the original thickness.</summary>
    public int? LineWidth { get; set; }

    /// <summary>The font pair, shadow strength and spacing of the client site (see <c>Finish</c>); null means <c>standard</c>.</summary>
    public string? FontPair { get; set; }

    public string? ShadowStrength { get; set; }

    public string? Spacing { get; set; }

    /// <summary>How the tiles style shows a category (see <c>Finish.TileGroups</c>); null means framed.</summary>
    public string? TileGroups { get; set; }

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

    /// <summary>Whether the owner addresses also get the summary of admin changes to dishes and settings (off by default).</summary>
    public bool OwnerChangeMails { get; set; }
}
