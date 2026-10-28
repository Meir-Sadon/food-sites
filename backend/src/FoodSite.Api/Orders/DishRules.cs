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
    /// add-on in both). A variant is never offered under itself, though its main dish offers it. AddOns (and
    /// MainDish.AddOns) must be loaded.
    /// </summary>
    public static IReadOnlyList<DishAddOn> AddOnLinks(Dish dish)
    {
        var own = dish.AddOns.OrderBy(a => a.Group?.DisplayOrder ?? int.MaxValue).ThenBy(a => a.DisplayOrder).ToList();
        if (dish.MainDish is not { } main)
            return own;
        var ownIds = own.Select(a => a.AddOnDishId).ToHashSet();
        // The dish's own offers of an add-on replace all of the main dish's offers of it.
        return main.AddOns.Where(a => !ownIds.Contains(a.AddOnDishId) && a.AddOnDishId != dish.Id)
            .OrderBy(a => a.Group?.DisplayOrder ?? int.MaxValue).ThenBy(a => a.DisplayOrder)
            .Concat(own).ToList();
    }

    /// <summary>
    /// The questions asked when ordering a dish: a variant's main dish's questions, then its own, then, for a dish with
    /// dietary tags, one optional question (several tags together, or one only with <see cref="Dish.DietaryTagsSingle"/>) over those tags (<see cref="Sites.DietaryTags.QuestionId"/>)
    /// so the client can pick a special version or leave the regular one. Questions (and MainDish.Questions) must be loaded.
    /// </summary>
    public static IReadOnlyList<DishQuestion> Questions(Dish dish)
    {
        var questions = (dish.MainDish?.Questions ?? []).OrderBy(q => q.DisplayOrder).ThenBy(q => q.Id)
            .Concat(dish.Questions.OrderBy(q => q.DisplayOrder).ThenBy(q => q.Id)).ToList();
        var tags = dish.DietaryTags.Where(Sites.DietaryTags.Labels.ContainsKey).ToList();
        if (tags.Count > 0)
            questions.Add(new DishQuestion
            {
                Id = Sites.DietaryTags.QuestionId,
                Text = Sites.DietaryTags.QuestionText,
                Kind = dish.DietaryTagsSingle ? QuestionKind.SingleChoice : QuestionKind.MultiChoice,
                Choices = tags.Select(t => Sites.DietaryTags.Labels[t]).ToList(),
                DisplayOrder = int.MaxValue,
            });
        return questions;
    }

    /// <summary>The add-on's name on an order line: its label tells apart the times it is offered under one dish.</summary>
    public static string AddOnName(DishAddOn link, Dish addOn) =>
        string.IsNullOrWhiteSpace(link.Label) ? addOn.Name : $"{addOn.Name} ({link.Label.Trim()})";

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
