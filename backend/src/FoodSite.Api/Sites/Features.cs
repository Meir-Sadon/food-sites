namespace FoodSite.Api.Sites;

/// <summary>
/// Behaviour that not every business wants. Each site turns a feature on in its <c>site.json</c> → <c>features</c>,
/// and a row in the <c>FeatureFlags</c> table overrides that (see <see cref="FeatureFlags"/>).
/// A feature a site doesn't list is off, so a new feature reaches no site until the site asks for it.
/// </summary>
public static class Features
{
    /// <summary>The recommendations page, and the client's own recommendations on the profile page.</summary>
    public const string Recommendations = "recommendations";

    /// <summary>Saving a past order as a favorite, the favorites list, and filling an order from one.</summary>
    public const string Favorites = "favorites";

    /// <summary>
    /// Review links in the admin's WhatsApp messages, the client's review page, the admin Reviews tab, and the
    /// approved reviews on the home page.
    /// </summary>
    public const string Reviews = "reviews";

    /// <summary>
    /// In the admin's dish form: variants shown in a main dish's card, yes or no dishes, and the add-ons of a dish set
    /// from the dish itself, with prices and limits of their own, check boxes and named groups with a limit.
    /// The order page shows whatever the admin set, so it needs no flag.
    /// </summary>
    public const string AdvancedDishes = "advancedDishes";

    /// <summary>
    /// The advanced delivery setting: the admin draws zones on a map, each with its own fee or no delivery at all,
    /// and the delivery fee is worked out from the address the client enters (see <c>DeliveryZones</c>).
    /// </summary>
    public const string DeliveryZones = "deliveryZones";

    public static readonly IReadOnlyList<string> All = [Recommendations, Favorites, Reviews, AdvancedDishes, DeliveryZones];

    public static bool IsKnown(string name) => All.Contains(name);
}
