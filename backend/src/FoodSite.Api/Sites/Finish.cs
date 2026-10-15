namespace FoodSite.Api.Sites;

/// <summary>
/// Three small choices about the client site's finish that apply on top of any style and any colours: the font
/// pair, how strong the shadows are and how much air there is between things. <c>standard</c> keeps what the style
/// itself does. The frontend turns them into <c>&lt;html data-font data-shadows data-spacing&gt;</c> (<c>styles/finish.css</c>).
/// </summary>
public static class Finish
{
    public const string Standard = "standard";

    public static readonly IReadOnlyList<string> Fonts = [Standard, "friendly", "elegant"];
    public static readonly IReadOnlyList<string> Shadows = [Standard, "none", "soft", "strong"];
    public static readonly IReadOnlyList<string> Spacings = [Standard, "compact", "spacious"];

    /// <summary>How the tiles style shows a category: in a framed block (the original look) or, minimal, as a plain heading with the tiles under it.</summary>
    public const string Framed = "framed";
    public static readonly IReadOnlyList<string> TileGroups = [Framed, "minimal"];

    public const int MaxLength = 20;

    public static bool IsKnownFont(string? value) => value is not null && Fonts.Contains(value);
    public static bool IsKnownShadows(string? value) => value is not null && Shadows.Contains(value);
    public static bool IsKnownSpacing(string? value) => value is not null && Spacings.Contains(value);
    public static bool IsKnownTileGroups(string? value) => value is not null && TileGroups.Contains(value);

    public static string EffectiveTileGroups(string? chosen) => IsKnownTileGroups(chosen) ? chosen! : Framed;

    /// <summary>What to show: the admin's choice, else <see cref="Standard"/>.</summary>
    public static string Effective(string? chosen, Func<string?, bool> isKnown) => isKnown(chosen) ? chosen! : Standard;
}
