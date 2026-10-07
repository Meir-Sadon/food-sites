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

    public static readonly IReadOnlyList<string> All = [Recommendations, Favorites];

    public static bool IsKnown(string name) => All.Contains(name);
}
