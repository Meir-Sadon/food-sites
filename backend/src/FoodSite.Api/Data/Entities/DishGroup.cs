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

    public List<DishGroupDish> Dishes { get; set; } = [];
}

public class DishGroupDish
{
    public int GroupId { get; set; }
    public DishGroup? Group { get; set; }
    public int DishId { get; set; }
    public Dish? Dish { get; set; }
}
