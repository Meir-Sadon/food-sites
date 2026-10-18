namespace FoodSite.Api.Data.Entities;

/// <summary>
/// A link to one of the business's pages elsewhere (see <c>SocialLinks.Kinds</c>), shown as a button on the About page.
/// A custom link carries its own <see cref="Label"/>; the known platforms are named by the site.
/// </summary>
public class SocialLink
{
    public const int LabelMaxLength = 40;
    public const int UrlMaxLength = 500;

    public int Id { get; set; }

    /// <summary><c>facebook</c>, <c>instagram</c>, <c>tiktok</c>, <c>youtube</c> or <c>custom</c>.</summary>
    public required string Kind { get; set; }

    /// <summary>The button's text for a custom link; null for a known platform.</summary>
    public string? Label { get; set; }

    public required string Url { get; set; }

    public int DisplayOrder { get; set; }
}
