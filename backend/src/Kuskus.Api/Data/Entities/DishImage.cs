namespace Kuskus.Api.Data.Entities;

public class DishImage
{
    public int Id { get; set; }
    public int DishId { get; set; }
    public Dish? Dish { get; set; }
    public required string Url { get; set; }

    /// <summary>The image's id in the image store, used to delete it there.</summary>
    public required string PublicId { get; set; }
    public int DisplayOrder { get; set; }
}
