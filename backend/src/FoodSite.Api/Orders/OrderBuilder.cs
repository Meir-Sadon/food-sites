using System.Globalization;
using FoodSite.Api.Controllers.Admin;
using FoodSite.Api.Data.Entities;

namespace FoodSite.Api.Orders;

/// <param name="Slot">Which offer of the add-on under the dish, when the dish offers the same add-on more than once.</param>
public record AddOnInput(int DishId, int? OptionId, decimal Quantity, int Slot = 0);

/// <summary>
/// An answer to one of the dish's questions: Value for text, a number, a date (yyyy-MM-dd), yes or no ("yes"/"no")
/// and a single choice; Choices for a multiple choice.
/// </summary>
public record AnswerInput(int QuestionId, string? Value = null, List<string>? Choices = null);

/// <summary>The add-ons, name or remark and answers of one ordered unit of a dish.</summary>
public record UnitAddOnsInput(List<AddOnInput>? AddOns, string? Note = null, List<AnswerInput>? Answers = null);

/// <summary>
/// AddOns are shared by the whole line (their limits grow with the quantity). AddOnUnits, when sent, has one entry
/// per ordered unit instead, each with add-ons of its own and the limits of one unit; AddOns is then ignored.
/// </summary>
public record OrderLineInput(
    int DishId, int? OptionId, decimal Quantity, List<AddOnInput>? AddOns, List<UnitAddOnsInput>? AddOnUnits = null, string? Note = null,
    List<AnswerInput>? Answers = null);

/// <summary>
/// Turns what the client chose into order lines, taking every name and price from the
/// dishes in the database. Nothing the client sends about prices is trusted.
/// </summary>
public static class OrderBuilder
{
    public const int MaxLines = 50;
    public const int MaxUnits = 99;

    /// <param name="dishes">
    /// Dishes with Options, Questions, AddOns (with their Group) and MainDish (with its Options, Questions and AddOns) loaded, by id.
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
            var questions = DishRules.Questions(dish);
            // With adjustment optional (a variant follows its main dish), even required questions may be left empty.
            var answersRequired = !(dish.MainDish ?? dish).AdjustmentOptional;
            if (line.AddOnUnits is not { } unitInputs)
            {
                item.Note = NoteOf(line.Note, $"{path}.note", errors);
                item.Answers = AnswersOf(questions, line.Answers, answersRequired, path, errors);
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
                .Select((unit, u) => (
                    children: AddOnsOf(links, unit.AddOns ?? [], $"{path}.addOnUnits[{u}]", 1, dishes, errors),
                    note: NoteOf(unit.Note, $"{path}.addOnUnits[{u}].note", errors),
                    answers: AnswersOf(questions, unit.Answers, answersRequired, $"{path}.addOnUnits[{u}]", errors)))
                .ToList();
            foreach (var group in perUnit.GroupBy(x => $"{x.note}#{Signature(x.children)}#{AnswersSignature(x.answers)}"))
            {
                var count = group.Count();
                var parent = Scaled(item, count);
                parent.Note = group.First().note;
                parent.Answers = group.First().answers;
                items.Add(parent);
                foreach (var child in group.First().children)
                    Attach(parent, Scaled(child, child.Quantity * count), items);
            }
        }
        return items;
    }

    /// <summary>The longest name or remark a client can write on a dish.</summary>
    public const int NoteMaxLength = 100;

    private static string? NoteOf(string? note, string path, Errors errors)
    {
        errors.Text(path, note, NoteMaxLength);
        return string.IsNullOrWhiteSpace(note) ? null : note.Trim();
    }

    /// <summary>The longest free-text answer to a dish question.</summary>
    public const int AnswerMaxLength = 200;

    /// <summary>
    /// Checks the answers to a dish's questions and turns them into text, in the questions' order. An answer to an
    /// unknown question, or one that is not one of its choices, is answerInvalid; a required question left empty is
    /// answerRequired, unless <paramref name="required"/> is off (the dish's adjustment is optional).
    /// </summary>
    private static List<OrderItemAnswer> AnswersOf(
        IReadOnlyList<DishQuestion> questions, IReadOnlyList<AnswerInput>? inputs, bool required, string path, Errors errors)
    {
        var answers = new List<OrderItemAnswer>();
        inputs ??= [];
        for (var k = 0; k < inputs.Count; k++)
            if (questions.All(q => q.Id != inputs[k].QuestionId) || inputs.Take(k).Any(a => a.QuestionId == inputs[k].QuestionId))
                errors.Add($"{path}.answers[{k}]", "answerInvalid");

        foreach (var question in questions)
        {
            var index = inputs.ToList().FindIndex(a => a.QuestionId == question.Id);
            var input = index < 0 ? null : inputs[index];
            var answerPath = $"{path}.answers[{(index < 0 ? inputs.Count : index)}]";
            var text = AnswerText(question, input, answerPath, errors);
            if (text is not null)
                answers.Add(new OrderItemAnswer { Question = question.Text, Answer = text });
            else if (question.IsRequired && required)
                errors.Add($"{path}.answers", "answerRequired");
        }
        return answers;
    }

    /// <summary>The answer as shown, null when there is none.</summary>
    private static string? AnswerText(DishQuestion question, AnswerInput? input, string path, Errors errors)
    {
        var value = input?.Value?.Trim();
        if (question.Kind == QuestionKind.MultiChoice)
        {
            var picked = (input?.Choices ?? []).Select(c => c.Trim()).Where(c => c != "").ToList();
            if (picked.Any(c => !question.Choices.Contains(c)) || picked.Distinct().Count() != picked.Count)
            {
                errors.Add(path, "answerInvalid");
                return null;
            }
            // In the admin's order, whatever order they were ticked in.
            return picked.Count == 0 ? null : string.Join(", ", question.Choices.Where(picked.Contains));
        }
        if (string.IsNullOrEmpty(value))
            return null;

        string? text = question.Kind switch
        {
            QuestionKind.Text => value.Length <= AnswerMaxLength ? value : null,
            QuestionKind.Number => decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var number)
                && Math.Abs(number) < 1_000_000_000
                ? number.ToString("0.###", CultureInfo.InvariantCulture) : null,
            QuestionKind.Date => DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
                ? date.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture) : null,
            QuestionKind.YesNo => value switch { "yes" => "כן", "no" => "לא", _ => null },
            QuestionKind.SingleChoice => question.Choices.Contains(value) ? value : null,
            _ => null,
        };
        if (text is null)
            errors.Add(path, question.Kind == QuestionKind.Text ? "tooLong" : "answerInvalid");
        return text;
    }

    private static string AnswersSignature(IEnumerable<OrderItemAnswer> answers) =>
        string.Join("|", answers.Select(a => $"{a.Question}={a.Answer}"));

    private static void Attach(OrderItem parent, OrderItem child, List<OrderItem> items)
    {
        child.ParentItem = parent;
        parent.AddOnItems.Add(child);
        items.Add(child);
    }

    private static string Signature(IEnumerable<OrderItem> children) =>
        string.Join("|", children.OrderBy(c => c.DishId).Select(c => $"{c.DishId}:{c.DishName}:{c.OptionLabel}:{c.UnitPrice}:{c.Quantity}"));

    /// <summary>The same line for another amount (units that share their add-ons are one line of that many).</summary>
    private static OrderItem Scaled(OrderItem source, decimal quantity) => new()
    {
        Dish = source.Dish,
        DishId = source.DishId,
        DishName = source.DishName,
        OptionLabel = source.OptionLabel,
        Note = source.Note,
        // Each line needs answers of its own: they are stored with it.
        Answers = source.Answers.Select(a => new OrderItemAnswer { Question = a.Question, Answer = a.Answer }).ToList(),
        Quantity = quantity,
        UnitPrice = source.UnitPrice,
        LineTotal = decimal.Round(source.UnitPrice * quantity, 2),
    };

    /// <summary>
    /// The add-on lines for one set of add-ons, checked against the parent's links. <paramref name="factor"/> is how many
    /// units of the parent the limits cover. Units above an add-on's or group's limit are refused, unless the admin set
    /// a price for them: they then become lines of their own at that price.
    /// </summary>
    private static List<OrderItem> AddOnsOf(
        IReadOnlyList<DishAddOn> links, IReadOnlyList<AddOnInput> addOns, string path, decimal factor,
        IReadOnlyDictionary<int, Dish> dishes, Errors errors)
    {
        var children = new List<OrderItem>();
        var seen = new HashSet<(int, int)>();
        var groupUsed = new Dictionary<int, decimal>();
        var groupFull = new HashSet<int>();
        for (var j = 0; j < addOns.Count; j++)
        {
            var addOn = addOns[j];
            var addOnPath = $"{path}.addOns[{j}]";
            var addOnDish = dishes.GetValueOrDefault(addOn.DishId);
            var link = links.FirstOrDefault(a => a.AddOnDishId == addOn.DishId && a.Slot == addOn.Slot);
            if (addOnDish is null || addOnDish.IsHidden || addOnDish.IsSoldOut || link is null || !seen.Add((addOn.DishId, addOn.Slot)))
            {
                errors.Add(addOnPath, "addOnUnavailable");
                continue;
            }

            var child = Line(addOnDish, addOn.OptionId, addOn.Quantity, addOnPath, errors,
                DishRules.IsCheckbox(link, addOnDish), link.Price);
            if (child is null)
                continue;
            child.DishName = DishRules.AddOnName(link, addOnDish);

            // Above the add-on's own limit.
            var over = 0m;
            if (link.MaxQuantity is { } max && child.Quantity > max * factor)
            {
                if (link.OverLimitPrice is null)
                {
                    errors.Add($"{addOnPath}.quantity", "addOnLimit");
                    continue;
                }
                over = child.Quantity - max * factor;
            }
            var within = child.Quantity - over;

            // Above the group's limit, counted over the add-ons picked so far.
            var groupOver = 0m;
            if (link.GroupId is { } groupId && link.Group is { MaxUnits: { } limit } group)
            {
                var units = DishRules.GroupUnits(link, addOnDish, within);
                var room = limit * factor - groupUsed.GetValueOrDefault(groupId);
                if (units > room)
                {
                    var perUnit = DishRules.GroupUnits(link, addOnDish, 2) > 1;
                    if (group.OverLimitPrice is null || (!perUnit && !DishRules.IsCheckbox(link, addOnDish)))
                    {
                        if (groupFull.Add(groupId))
                            errors.Add($"{path}.addOns", "addOnGroupLimit");
                        continue;
                    }
                    groupOver = perUnit ? units - Math.Max(0, room) : within;
                    units = perUnit ? units - groupOver : 0;
                }
                groupUsed[groupId] = groupUsed.GetValueOrDefault(groupId) + units;
            }
            else if (link.GroupId is { } otherGroup)
                groupUsed[otherGroup] = groupUsed.GetValueOrDefault(otherGroup) + DishRules.GroupUnits(link, addOnDish, within);

            if (over == 0 && groupOver == 0)
            {
                children.Add(child);
                continue;
            }
            if (within - groupOver > 0)
                children.Add(Part(child, within - groupOver, child.UnitPrice, ""));
            if (groupOver > 0)
                children.Add(Part(child, groupOver, link.Group!.OverLimitPrice!.Value, OverLimitSuffix));
            if (over > 0)
                children.Add(Part(child, over, link.OverLimitPrice!.Value, OverLimitSuffix));
        }
        return children;
    }

    /// <summary>Marks the units that cost the admin's extra price for going over a limit.</summary>
    public const string OverLimitSuffix = " (מעבר למכסה)";

    /// <summary>A part of an add-on line at another amount and price (the units above a limit).</summary>
    private static OrderItem Part(OrderItem source, decimal quantity, decimal unitPrice, string nameSuffix) => new()
    {
        Dish = source.Dish,
        DishId = source.DishId,
        DishName = source.DishName + nameSuffix,
        OptionLabel = source.OptionLabel,
        Quantity = quantity,
        UnitPrice = unitPrice,
        LineTotal = decimal.Round(unitPrice * quantity, 2),
    };

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
