namespace Kuskus.Api.Data.Entities;

/// <summary>Offers <see cref="AddOnDish"/> as an add-on under <see cref="ParentDish"/>.</summary>
public class DishAddOn
{
    public int ParentDishId { get; set; }
    public Dish? ParentDish { get; set; }

    public int AddOnDishId { get; set; }
    public Dish? AddOnDish { get; set; }
}
