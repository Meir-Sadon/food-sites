namespace FoodSite.Api.Data.Entities;

/// <summary>One picture of the banner's scroll animation; scrolling moves through the pictures in <see cref="DisplayOrder"/>.</summary>
public class BannerFrame
{
    public int Id { get; set; }
    public int DisplayOrder { get; set; }
    public string ImageUrl { get; set; } = "";
    public string ImagePublicId { get; set; } = "";
}
