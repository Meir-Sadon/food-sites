using FoodSite.Api.Controllers.Admin;
using FoodSite.Api.Data.Entities;

namespace FoodSite.Api.Orders;

public record AddOnInput(int DishId, int? OptionId, decimal Quantity);

/// <summary>The add-ons of one ordered unit of a dish.</summary>
public record UnitAddOnsInput(List<AddOnInput>? AddOns);

/// <summary>
/// AddOns are shared by the whole line (their limits grow with the quantity). AddOnUnits, when sent, has one entry
/// per ordered unit instead, each with add-ons of its own and the limits of one unit; AddOns is then ignored.
/// </summary>
public record OrderLineInput(
    int DishId, int? OptionId, decimal Quantity, List<AddOnInput>? AddOns, List<UnitAddOnsInput>? AddOnUnits = null);

/// <summary>
/// Turns what the client chose into order lines, taking every name and price from the
/// dishes in the database. Nothing the client sends about prices is trusted.
/// </summary>
public static class OrderBuilder
{
    public const int MaxLines = 50;
    public const int MaxUnits = 99;

    /// <param name="dishes">
    /// Dishes with Options, AddOns (with their Group) and MainDish (with its Options and AddOns) loaded, by id.
    /// </param>
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
            if (dish is null || dish.IsHidden || dish.IsSoldOut || dish.IsAddOnOnly || dish.Category is { IsHidden: true }
                || dish.MainDish is { IsHidden: true } or { IsSoldOut: true })
            {
                errors.Add(path, "dishUnavailable");
                continue;
            }

            var item = Line(dish, line.OptionId, line.Quantity, path, errors, dish.IsYesNo, price: null);
            if (item is null)
                continue;

            var links = DishRules.AddOnLinks(dish);
            if (line.AddOnUnits is not { } unitInputs)
            {
                items.Add(item);
                foreach (var child in AddOnsOf(links, line.AddOns ?? [], path, DishRules.LimitFactor(dish, item.Quantity), dishes, errors))
                    Attach(item, child, items);
                continue;
            }

            if (unitInputs.Count != item.Quantity || DishRules.Pricing(dish).SellBy != SellBy.Units)
            {
                errors.Add($"{path}.addOnUnits", "addOnUnitsInvalid");
                continue;
            }

            // Units with the same add-ons share one order line, so a plain order stays one line.
            var perUnit = unitInputs
                .Select((unit, u) => AddOnsOf(links, unit.AddOns ?? [], $"{path}.addOnUnits[{u}]", 1, dishes, errors))
                .ToList();
            foreach (var group in perUnit.Select((children, u) => (children, u)).GroupBy(x => Signature(x.children)))
            {
                var count = group.Count();
                var parent = Scaled(item, count);
                items.Add(parent);
                foreach (var child in group.First().children)
                    Attach(parent, Scaled(child, child.Quantity * count), items);
            }
        }
        return items;
    }

    private static void Attach(OrderItem parent, OrderItem child, List<OrderItem> items)
    {
        child.ParentItem = parent;
        parent.AddOnItems.Add(child);
        items.Add(child);
    }

    private static string Signature(IEnumerable<OrderItem> children) =>
        string.Join("|", children.OrderBy(c => c.DishId).Select(c => $"{c.DishId}:{c.OptionLabel}:{c.Quantity}"));

    /// <summary>The same line for another amount (units that share their add-ons are one line of that many).</summary>
    private static OrderItem Scaled(OrderItem source, decimal quantity) => new()
    {
        Dish = source.Dish,
        DishId = source.DishId,
        DishName = source.DishName,
        OptionLabel = source.OptionLabel,
        Quantity = quantity,
        UnitPrice = source.UnitPrice,
        LineTotal = decimal.Round(source.UnitPrice * quantity, 2),
    };

    /// <summary>
    /// The add-on lines for one set of add-ons, checked against the parent's links. <paramref name="factor"/> is how many
    /// units of the parent the limits cover.
    /// </summary>
    private static List<OrderItem> AddOnsOf(
        IReadOnlyList<DishAddOn> links, IReadOnlyList<AddOnInput> addOns, string path, decimal factor,
        IReadOnlyDictionary<int, Dish> dishes, Errors errors)
    {
        var children = new List<OrderItem>();
        var seen = new HashSet<int>();
        var groupUnits = new Dictionary<int, decimal>();
        for (var j = 0; j < addOns.Count; j++)
        {
            var addOn = addOns[j];
            var addOnPath = $"{path}.addOns[{j}]";
            var addOnDish = dishes.GetValueOrDefault(addOn.DishId);
            var link = links.FirstOrDefault(a => a.AddOnDishId == addOn.DishId);
            if (addOnDish is null || addOnDish.IsHidden || addOnDish.IsSoldOut || link is null || !seen.Add(addOn.DishId))
            {
                errors.Add(addOnPath, "addOnUnavailable");
                continue;
            }

            var child = Line(addOnDish, addOn.OptionId, addOn.Quantity, addOnPath, errors,
                DishRules.IsCheckbox(link, addOnDish), link.Price);
            if (child is null)
                continue;
            if (link.MaxQuantity is { } max && child.Quantity > max * factor)
            {
                errors.Add($"{addOnPath}.quantity", "addOnLimit");
                continue;
            }
            if (link.GroupId is { } groupId)
                groupUnits[groupId] = groupUnits.GetValueOrDefault(groupId) + DishRules.GroupUnits(link, addOnDish, child.Quantity);
            children.Add(child);
        }

        foreach (var (groupId, units) in groupUnits)
        {
            var group = links.First(a => a.GroupId == groupId).Group;
            if (group?.MaxUnits is { } limit && units > limit * factor)
                errors.Add($"{path}.addOns", "addOnGroupLimit");
        }
        return children;
    }

    public static decimal Total(IEnumerable<OrderItem> items) => items.Sum(i => i.LineTotal);

    /// <param name="yesNo">Ordered or not, never in an amount: the client's amount and option are replaced by the defaults.</param>
    /// <param name="price">An add-on's price per unit under its parent: only the default option is offered, at this price.</param>
    private static OrderItem? Line(Dish dish, int? optionId, decimal quantity, string path, Errors errors, bool yesNo, decimal? price)
    {
        var pricing = DishRules.Pricing(dish);
        if (pricing.ChoiceMode == ChoiceMode.Free)
        {
            if (yesNo && pricing.MinAmount is { } least)
                quantity = least;
            if (pricing.MinAmount is not { } min || pricing.MaxAmount is not { } max
                || pricing.AmountStep is not { } step || pricing.UnitPrice is not { } unitPrice
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
                OptionLabel = pricing.UnitName ?? (pricing.SellBy == SellBy.Weight ? "ק״ג" : "יח׳"),
                Quantity = quantity,
                UnitPrice = price ?? unitPrice,
                LineTotal = decimal.Round((price ?? unitPrice) * quantity, 2),
            };
        }

        var defaultOption = pricing.Options.FirstOrDefault(o => o.IsDefault) ?? pricing.Options.FirstOrDefault();
        if (yesNo)
            quantity = 1;
        var option = yesNo || price is not null ? defaultOption
            : optionId is { } id ? pricing.Options.FirstOrDefault(o => o.Id == id)
            : defaultOption;
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
            UnitPrice = price ?? option.Price,
            LineTotal = decimal.Round((price ?? option.Price) * quantity, 2),
        };
    }
}
