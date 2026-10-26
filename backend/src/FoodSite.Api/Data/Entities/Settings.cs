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

    /// <summary>
    /// The advanced (zones) setting's base fee: what a delivery is discounted by once the dishes reach
    /// <see cref="DeliveryDiscountMinOrder"/>, so a far zone still pays what is above it. Null means no discount there.
    /// </summary>
    public decimal? DeliveryBaseFee { get; set; }

    /// <summary>The dishes total from which the delivery fee is discounted; null means never.</summary>
    public decimal? DeliveryDiscountMinOrder { get; set; }

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

    /// <summary>Length of one hour slot a client picks, in minutes: 15, 30 or 60 (see <c>SlotTiming</c>).</summary>
    public int SlotMinutes { get; set; } = 60;

    /// <summary>Slots start on round marks of <see cref="SlotMinutes"/> (a range opening at 20:07 starts at 20:30), instead of at the range's own start.</summary>
    public bool AlignSlots { get; set; }

    /// <summary>Minutes before the start of a slot after which a delivery can no longer be ordered for it; 0 means none.</summary>
    public int DeliveryLeadMinutes { get; set; }

    /// <summary>The same for pickup.</summary>
    public int PickupLeadMinutes { get; set; }

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

    /// <summary>Meta (Facebook / Instagram) Pixel id; null means the pixel is not loaded. See <c>Sites/Tracking</c>.</summary>
    public string? MetaPixelId { get; set; }

    /// <summary>Google Analytics 4 measurement id (<c>G-…</c>); null means it is not loaded.</summary>
    public string? GoogleAnalyticsId { get; set; }

    /// <summary>Google Tag Manager container id (<c>GTM-…</c>); null means it is not loaded.</summary>
    public string? GoogleTagManagerId { get; set; }

    /// <summary>TikTok pixel code; null means it is not loaded.</summary>
    public string? TikTokPixelId { get; set; }

    /// <summary>Google Ads conversion id (<c>AW-…</c>); null means no Ads tag.</summary>
    public string? GoogleAdsId { get; set; }

    /// <summary>The label of the Ads conversion counted when an order is sent.</summary>
    public string? GoogleAdsPurchaseLabel { get; set; }

    /// <summary>
    /// Meta Conversions API access token: with the pixel id it lets the server report each order to Meta. A secret,
    /// never returned by the API and recorded in the audit trail without its value.
    /// </summary>
    public string? MetaAccessToken { get; set; }

    // Accessibility statement (הצהרת נגישות): who answers accessibility requests, and the limits the business knows of.
    /// <summary>The accessibility coordinator's contact; each is null when the statement should fall back to the main contact.</summary>
    public string? AccessibilityCoordinatorName { get; set; }
    public string? AccessibilityCoordinatorPhone { get; set; }
    public string? AccessibilityCoordinatorEmail { get; set; }

    /// <summary>Known accessibility limits (for example a part of the site not yet accessible), shown in the statement.</summary>
    public string? AccessibilityNotes { get; set; }

    /// <summary>When the coordinator details or notes were last saved; shown as the statement's update date.</summary>
    public DateTimeOffset? AccessibilityUpdatedAt { get; set; }

    // Item badges (Sites/ItemBadges): "new" and "almost out" marks on dishes; both off until the admin turns them on.
    public bool BadgeNewEnabled { get; set; }

    /// <summary>A dish is new for this many days, weeks or months (<see cref="BadgeNewUnit"/>) after it was created; null means the default.</summary>
    public int? BadgeNewAmount { get; set; }
    public string? BadgeNewUnit { get; set; }

    public bool BadgeLowStockEnabled { get; set; }

    /// <summary><c>percent</c> of the dish's limit or a number of <c>units</c>; null means the default.</summary>
    public string? BadgeLowStockMode { get; set; }

    /// <summary>A limited dish is "almost out" when what is left is at most this percent or number of units.</summary>
    public int? BadgeLowStockAmount { get; set; }

    // Entry pop-up, legacy: the single pop-up that lived here was copied into <c>PopupSlot</c> 1 by the Popups migration.
    // Nothing reads these columns any more; a later migration drops them (expand, then contract).
    public bool PopupEnabled { get; set; }

    /// <summary>small, medium or large; null means medium.</summary>
    public string? PopupSize { get; set; }

    /// <summary>always (every page load) or session (once per browser tab); null means always.</summary>
    public string? PopupFrequency { get; set; }

    /// <summary>load (when the page has loaded) or exit (when the visitor seems about to leave); null means load.</summary>
    public string? PopupTrigger { get; set; }

    /// <summary>Seconds to wait before opening it, or before watching for an exit; null means none.</summary>
    public int? PopupDelaySeconds { get; set; }

    public string? PopupTitle { get; set; }
    public string? PopupBody { get; set; }
    public string? PopupImageUrl { get; set; }
    public string? PopupImagePublicId { get; set; }
    public string? PopupButtonText { get; set; }
    public string? PopupButtonUrl { get; set; }

    /// <summary>
    /// A client who has not ordered for this many <see cref="InactiveAfterUnit"/> counts as inactive (see <c>Popup/EntryPopup</c>);
    /// null means the default.
    /// </summary>
    public int? InactiveAfterAmount { get; set; }

    /// <summary>week or month; null means the default.</summary>
    public string? InactiveAfterUnit { get; set; }

    /// <summary>How working hours change around Shabbat and holidays, as JSON (see <c>Sites/ShabbatRules</c>); null means no change.</summary>
    public string? ShabbatRules { get; set; }
}
