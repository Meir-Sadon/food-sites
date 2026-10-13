namespace FoodSite.Api.Data.Entities;

/// <summary>Offers <see cref="AddOnDish"/> as an add-on under <see cref="ParentDish"/>.</summary>
public class DishAddOn
{
    public int ParentDishId { get; set; }
    public Dish? ParentDish { get; set; }

    public int AddOnDishId { get; set; }
    public Dish? AddOnDish { get; set; }

    /// <summary>Where the add-on sits among the parent's add-ons; links made from the add-on's side are 0.</summary>
    public int DisplayOrder { get; set; }

    /// <summary>The parent's add-on group it is shown in, which limits the units picked from the whole group.</summary>
    public int? GroupId { get; set; }
    public AddOnGroup? Group { get; set; }

    /// <summary>
    /// The price per unit (or kilo) of the add-on under this parent, instead of its own price, e.g. chicken 8 ₪
    /// with couscous though it is 12 ₪ on its own. With a price the add-on is offered in its default option only.
    /// Zero is allowed. Null keeps the add-on's own prices.
    /// </summary>
    public decimal? Price { get; set; }

    /// <summary>The most of the add-on the client can add per ordered unit of the parent (2 parents with 2 allow 4); null for the add-on's own range.</summary>
    public decimal? MaxQuantity { get; set; }

    /// <summary>Under this parent the add-on is a check box: added or not, never in an amount.</summary>
    public bool IsCheckbox { get; set; }

    /// <summary>
    /// The link was made on the add-on's own form ("add-on to other dishes", or a seed's AddOnOf). Only these links
    /// show (and change) there; the ones the parent set up among its own add-ons are the parent's alone.
    /// </summary>
    public bool LinkedFromAddOn { get; set; }
}
