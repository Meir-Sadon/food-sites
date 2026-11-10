namespace FoodSite.Api.Data.Entities;

/// <summary>
/// The order page's top banner (see <c>Banner/OrderBannerRules</c>): the admin's own banner instead of the standard one,
/// and the scroll animation shown under it. One row, created when the admin first saves; no row means the standard banner.
/// </summary>
public class OrderBanner
{
    public int Id { get; set; }

    /// <summary>Show this banner instead of the standard one.</summary>
    public bool Enabled { get; set; }

    public string? Title { get; set; }
    public string? Tagline { get; set; }

    /// <summary>The ovals under the tagline, one per line (up to <c>OrderBannerRules.MaxChips</c>); null means the standard ones.</summary>
    public string? Chips { get; set; }

    /// <summary>Banner colour as <c>#rrggbb</c>; null means the site's palette.</summary>
    public string? Background { get; set; }

    /// <summary>Text colour as <c>#rrggbb</c>; null means the site's palette.</summary>
    public string? TextColor { get; set; }

    /// <summary>The logo inside the banner; null means the site's main logo.</summary>
    public string? LogoUrl { get; set; }
    public string? LogoPublicId { get; set; }

    /// <summary>Show the scroll animation (the <see cref="BannerFrame"/>s) under the banner.</summary>
    public bool AnimationEnabled { get; set; }

    /// <summary>How many screen heights of scrolling the animation takes; null means the default.</summary>
    public int? AnimationScreens { get; set; }
}
