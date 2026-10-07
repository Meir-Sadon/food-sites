namespace FoodSite.Api.Data.Entities;

public class Category
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public int DisplayOrder { get; set; }

    /// <summary>
    /// A removed category that still holds removed dishes is hidden instead of deleted,
    /// so old orders keep their references.
    /// </summary>
    public bool IsHidden { get; set; }

    public List<Dish> Dishes { get; set; } = [];
}
