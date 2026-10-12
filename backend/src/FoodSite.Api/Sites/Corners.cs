namespace FoodSite.Api.Sites;

/// <summary>
/// How round the corners of the client site's pictures, buttons, cards and fields are. The frontend turns the
/// choice into a scale on every corner radius (<c>&lt;html data-corners&gt;</c> → <c>--corner-scale</c>). A site's
/// default is <c>site.json</c> → <c>settings.corners</c>; the admin's choice in <c>Settings.Corners</c> wins over it.
/// </summary>
public static class Corners
{
    /// <summary>No rounding at all.</summary>
    public const string Square = "square";

    /// <summary>Half of today's rounding.</summary>
    public const string Slight = "slight";

    /// <summary>The original look.</summary>
    public const string Rounded = "rounded";

    /// <summary>Twice today's rounding.</summary>
    public const string Round = "round";

    public static readonly IReadOnlyList<string> All = [Square, Slight, Rounded, Round];

    public const int MaxLength = 20;

    public static bool IsKnown(string? name) => name is not null && All.Contains(name);

    /// <summary>The corners the site shows: the admin's choice, else the site's default, else <see cref="Rounded"/>.</summary>
    public static string Effective(string? chosen, string? siteDefault) =>
        IsKnown(chosen) ? chosen! : IsKnown(siteDefault) ? siteDefault! : Rounded;
}
