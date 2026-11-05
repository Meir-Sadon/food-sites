namespace FoodSite.Api.Data.Entities;

/// <summary>
/// A named selection of dishes the admin curates (such as "מומלצות" or "מנות במבצע"), shown as its own section at the
/// top of the order page. Its dishes can come from any categories, and a dish can be in several groups.
/// </summary>
public class DishGroup
{
    public const int NameMaxLength = 60;

    public int Id { get; set; }
    public required string Name { get; set; }
    public int DisplayOrder { get; set; }

    /// <summary>This group's dish layout (see <c>SectionLook.Layouts</c>); null means the site's own.</summary>
    public string? Layout { get; set; }

    /// <summary>This group's picture size (see <c>Finish.ImageSizes</c>); null means the site's own.</summary>
    public string? ImageSize { get; set; }

    public List<DishGroupDish> Dishes { get; set; } = [];
}

public class DishGroupDish
{
    public int GroupId { get; set; }
    public DishGroup? Group { get; set; }
    public int DishId { get; set; }
    public Dish? Dish { get; set; }
}
