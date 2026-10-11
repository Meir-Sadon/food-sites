using FoodSite.Api.Data.Entities;

namespace FoodSite.Api.Orders;

/// <summary>What a dish is priced by and offers, once variants and add-on settings are taken into account.</summary>
public static class DishRules
{
    /// <summary>
    /// The dish whose choice mode, options and amounts price <paramref name="dish"/>: its main dish when it is a variant
    /// priced like it (MainDish loaded), else itself.
    /// </summary>
    public static Dish Pricing(Dish dish) => dish is { UseMainDishPrice: true, MainDish: { } main } ? main : dish;

    /// <summary>
    /// The add-ons offered under a dish: a variant's main dish's add-ons, then its own (its own settings win for an
    /// add-on in both). AddOns (and MainDish.AddOns) must be loaded.
    /// </summary>
    public static IReadOnlyList<DishAddOn> AddOnLinks(Dish dish)
    {
        var own = dish.AddOns.OrderBy(a => a.Group?.DisplayOrder ?? int.MaxValue).ThenBy(a => a.DisplayOrder).ToList();
        if (dish.MainDish is not { } main)
            return own;
        var ownIds = own.Select(a => a.AddOnDishId).ToHashSet();
        return main.AddOns.Where(a => !ownIds.Contains(a.AddOnDishId))
            .OrderBy(a => a.Group?.DisplayOrder ?? int.MaxValue).ThenBy(a => a.DisplayOrder)
            .Concat(own).ToList();
    }

    /// <summary>The add-on is added or not, never in an amount: a check box under this parent, or a yes or no dish.</summary>
    public static bool IsCheckbox(DishAddOn link, Dish addOn) => link.IsCheckbox || addOn.IsYesNo;

    /// <summary>
    /// How many units an add-on line takes from its group's limit: an amount of units counts as that many, a check box
    /// or a weight counts one.
    /// </summary>
    public static decimal GroupUnits(DishAddOn link, Dish addOn, decimal quantity) =>
        IsCheckbox(link, addOn) || Pricing(addOn).SellBy == SellBy.Weight ? 1 : quantity;

    /// <summary>
    /// Add-on limits (per add-on and per group) are per unit of the ordered dish: 2 couscous with a limit of 2 allow 4.
    /// A dish sold by weight counts once.
    /// </summary>
    public static decimal LimitFactor(Dish dish, decimal quantity) => Pricing(dish).SellBy == SellBy.Units ? quantity : 1;
}
