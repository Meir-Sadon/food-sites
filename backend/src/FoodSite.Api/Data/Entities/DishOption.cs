namespace FoodSite.Api.Data.Entities;

/// <summary>A fixed weight or unit option of a dish, such as "1 kg" for 80 ₪.</summary>
public class DishOption
{
    public int Id { get; set; }
    public int DishId { get; set; }
    public Dish? Dish { get; set; }
    public required string Label { get; set; }
    public decimal Amount { get; set; }
    public decimal Price { get; set; }
    public bool IsDefault { get; set; }
}
