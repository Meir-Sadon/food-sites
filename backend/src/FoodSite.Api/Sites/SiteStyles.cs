namespace FoodSite.Api.Sites;

/// <summary>
/// The looks a site can have: fonts, shapes and layout. Colours stay in each site's <c>theme.css</c>, so every style
/// works with every palette. A site's default is <c>site.json</c> → <c>settings.style</c> (else <see cref="Classic"/>);
/// the admin's choice in <c>Settings.SiteStyle</c> wins over it. The frontend has a stylesheet per style.
/// </summary>
public static class SiteStyles
{
    /// <summary>The original look.</summary>
    public const string Classic = "classic";

    /// <summary>Thick outlines, hard offset shadows, sticker labels and big picture cards.</summary>
    public const string Street = "street";

    public static readonly IReadOnlyList<string> All = [Classic, Street];

    public const int MaxLength = 20;

    public static bool IsKnown(string? name) => name is not null && All.Contains(name);

    /// <summary>The style the site shows: the admin's choice, else the site's default, else <see cref="Classic"/>.</summary>
    public static string Effective(string? chosen, string? siteDefault) =>
        IsKnown(chosen) ? chosen! : IsKnown(siteDefault) ? siteDefault! : Classic;
}
