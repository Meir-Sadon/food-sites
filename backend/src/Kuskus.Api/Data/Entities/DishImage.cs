namespace Kuskus.Api.Data.Entities;

public class DishImage
{
    public int Id { get; set; }
    public int DishId { get; set; }
    public Dish? Dish { get; set; }
    public required string Url { get; set; }
    public int DisplayOrder { get; set; }
}
