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

    /// <summary>
    /// How big the dishes' pictures are on the order page (in the rect style: how big the rectangles are). <c>small</c>
    /// is the default, about three quarters of what the pictures used to be; <c>medium</c> is the old size.
    /// </summary>
    public const string DefaultImageSize = "small";
    public static readonly IReadOnlyList<string> ImageSizes = ["tiny", DefaultImageSize, "medium", "large", "huge"];

    /// <summary>
    /// Which side of a rectangle (the rect style) the dish's picture, with its add button and amount control, is on:
    /// <c>end</c> (the default: the left in Hebrew, with the text on the right) or <c>start</c> (the right).
    /// </summary>
    public const string PictureEnd = "end";
    public static readonly IReadOnlyList<string> RectPictures = [PictureEnd, "start"];

    /// <summary>
    /// How tiles and rectangles are laid out on a phone: <c>standard</c> keeps the tiles grid and the rectangles' margins,
    /// <c>full</c> makes each one take the whole row, edge to edge without a margin, one after another.
    /// </summary>
    public const string MobileStandard = "standard";
    public static readonly IReadOnlyList<string> MobileCards = [MobileStandard, "full"];

    public const int MaxLength = 20;

    public static bool IsKnownFont(string? value) => value is not null && Fonts.Contains(value);
    public static bool IsKnownShadows(string? value) => value is not null && Shadows.Contains(value);
    public static bool IsKnownSpacing(string? value) => value is not null && Spacings.Contains(value);
    public static bool IsKnownTileGroups(string? value) => value is not null && TileGroups.Contains(value);

    public static bool IsKnownImageSize(string? value) => value is not null && ImageSizes.Contains(value);

    public static string EffectiveImageSize(string? chosen) => IsKnownImageSize(chosen) ? chosen! : DefaultImageSize;

    public static bool IsKnownRectPicture(string? value) => value is not null && RectPictures.Contains(value);

    public static bool IsKnownMobileCards(string? value) => value is not null && MobileCards.Contains(value);

    public static string EffectiveRectPicture(string? chosen) => IsKnownRectPicture(chosen) ? chosen! : PictureEnd;

    public static string EffectiveMobileCards(string? chosen) => IsKnownMobileCards(chosen) ? chosen! : MobileStandard;

    public static string EffectiveTileGroups(string? chosen) => IsKnownTileGroups(chosen) ? chosen! : Framed;

    /// <summary>What to show: the admin's choice, else <see cref="Standard"/>.</summary>
    public static string Effective(string? chosen, Func<string?, bool> isKnown) => isKnown(chosen) ? chosen! : Standard;
}
