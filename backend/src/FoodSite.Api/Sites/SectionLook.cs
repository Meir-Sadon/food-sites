namespace FoodSite.Api.Sites;

/// <summary>
/// A category or a dish group can look different from the rest of the order page: its own dish layout and picture
/// size, chosen from lists. Null (or empty) means the site's own look (<see cref="SiteStyles"/>, <see cref="Finish.ImageSizes"/>).
/// </summary>
public static class SectionLook
{
    /// <summary><c>list</c> is the site's regular dish card; <c>tiles</c> and <c>rect</c> are the tiles and rectangles looks.</summary>
    public static readonly IReadOnlyList<string> Layouts = ["list", SiteStyles.Tiles, SiteStyles.Rect];

    public const int MaxLength = 20;

    /// <summary>Whether the value may be saved: nothing (the site's look) or one of the known ones.</summary>
    public static bool IsValidLayout(string? value) => string.IsNullOrEmpty(value) || Layouts.Contains(value);

    public static bool IsValidImageSize(string? value) => string.IsNullOrEmpty(value) || Finish.IsKnownImageSize(value);

    /// <summary>What to store: null for the site's look.</summary>
    public static string? Clean(string? value) => string.IsNullOrEmpty(value) ? null : value;
}
