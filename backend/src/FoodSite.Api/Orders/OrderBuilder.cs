using FoodSite.Api.Controllers.Admin;
using FoodSite.Api.Data.Entities;

namespace FoodSite.Api.Orders;

public record AddOnInput(int DishId, int? OptionId, decimal Quantity);

public record OrderLineInput(int DishId, int? OptionId, decimal Quantity, List<AddOnInput>? AddOns);

/// <summary>
/// Turns what the client chose into order lines, taking every name and price from the
/// dishes in the database. Nothing the client sends about prices is trusted.
/// </summary>
public static class OrderBuilder
{
    public const int MaxLines = 50;
    public const int MaxUnits = 99;

    /// <param name="dishes">Dishes with Options and AddOns loaded, by id.</param>
    public static List<OrderItem> Build(
        IReadOnlyList<OrderLineInput>? lines, IReadOnlyDictionary<int, Dish> dishes, Errors errors)
    {
        var items = new List<OrderItem>();
        if (lines is null || lines.Count == 0)
        {
            errors.Add("items", "emptyOrder");
            return items;
        }
        if (lines.Count > MaxLines)
        {
            errors.Add("items", "tooManyItems");
            return items;
        }

        for (var i = 0; i < lines.Count; i++)
        {
            var line = lines[i];
            var path = $"items[{i}]";
            var dish = dishes.GetValueOrDefault(line.DishId);
            if (dish is null || dish.IsHidden || dish.IsSoldOut || dish.IsAddOnOnly || dish.Category is { IsHidden: true })
            {
                errors.Add(path, "dishUnavailable");
                continue;
            }

            var item = Line(dish, line.OptionId, line.Quantity, path, errors);
            if (item is null)
                continue;
            items.Add(item);

            var seen = new HashSet<int>();
            var addOns = line.AddOns ?? [];
            for (var j = 0; j < addOns.Count; j++)
            {
                var addOn = addOns[j];
                var addOnPath = $"{path}.addOns[{j}]";
                var addOnDish = dishes.GetValueOrDefault(addOn.DishId);
                if (addOnDish is null || addOnDish.IsHidden || addOnDish.IsSoldOut
                    || dish.AddOns.All(a => a.AddOnDishId != addOn.DishId) || !seen.Add(addOn.DishId))
                {
                    errors.Add(addOnPath, "addOnUnavailable");
                    continue;
                }

                var child = Line(addOnDish, addOn.OptionId, addOn.Quantity, addOnPath, errors);
                if (child is null)
                    continue;
                child.ParentItem = item;
                item.AddOnItems.Add(child);
                items.Add(child);
            }
        }
        return items;
    }

    public static decimal Total(IEnumerable<OrderItem> items) => items.Sum(i => i.LineTotal);

    private static OrderItem? Line(Dish dish, int? optionId, decimal quantity, string path, Errors errors)
    {
        if (dish.ChoiceMode == ChoiceMode.Free)
        {
            if (dish.MinAmount is not { } min || dish.MaxAmount is not { } max
                || dish.AmountStep is not { } step || dish.UnitPrice is not { } price
                || quantity < min || quantity > max || (quantity - min) % step != 0)
            {
                errors.Add($"{path}.quantity", "quantityInvalid");
                return null;
            }
            return new OrderItem
            {
                Dish = dish,
                DishId = dish.Id,
                DishName = dish.Name,
                OptionLabel = dish.UnitName ?? (dish.SellBy == SellBy.Weight ? "ק״ג" : "יח׳"),
                Quantity = quantity,
                UnitPrice = price,
                LineTotal = decimal.Round(price * quantity, 2),
            };
        }

        var option = optionId is { } id
            ? dish.Options.FirstOrDefault(o => o.Id == id)
            : dish.Options.FirstOrDefault(o => o.IsDefault) ?? dish.Options.FirstOrDefault();
        if (option is null)
        {
            errors.Add($"{path}.optionId", "optionInvalid");
            return null;
        }
        if (quantity < 1 || quantity > MaxUnits || quantity % 1 != 0)
        {
            errors.Add($"{path}.quantity", "quantityInvalid");
            return null;
        }
        return new OrderItem
        {
            Dish = dish,
            DishId = dish.Id,
            DishName = dish.Name,
            OptionLabel = option.Label,
            Quantity = quantity,
            UnitPrice = option.Price,
            LineTotal = decimal.Round(option.Price * quantity, 2),
        };
    }
}
