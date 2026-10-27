using FoodSite.Api.Data.Entities;

namespace FoodSite.Api.Orders;

/// <summary>A rule as the admin form and the order page see it; From and To are both null for the whole day.</summary>
public record AvailabilityRuleDto(DayOfWeek Weekday, TimeOnly? From = null, TimeOnly? To = null);

/// <summary>Whether a dish is sold on the day and in the hour a client asked for (its availability rules).</summary>
public static class DishAvailability
{
    /// <summary>
    /// The moment an order is for: <see cref="Date"/> is the date of the slot itself (a slot after midnight belongs to the
    /// next date), <see cref="From"/> and <see cref="To"/> its hours, or null when the day has no hours to pick.
    /// </summary>
    public record When(DateOnly Date, TimeSpan? From = null, TimeSpan? To = null);

    /// <summary>The moment of a slot offered for <paramref name="supplyDate"/> (null for a day with no hours).</summary>
    public static When Of(DateOnly supplyDate, SupplyCalendar.HourSlot? slot) =>
        slot is null
            ? new When(supplyDate)
            : new When(slot.Date ?? supplyDate, slot.From.ToTimeSpan(), slot.To == TimeOnly.MinValue ? TimeSpan.FromDays(1) : slot.To.ToTimeSpan());

    /// <summary>A dish with no rules is always sold; with rules, only when one covers the whole slot (the whole day for a day without hours).</summary>
    public static bool Allows(IEnumerable<DishAvailabilityRule> rules, When when)
    {
        var list = rules as IReadOnlyCollection<DishAvailabilityRule> ?? rules.ToList();
        if (list.Count == 0)
            return true;
        return list.Any(r => r.Weekday == when.Date.DayOfWeek
            && (r.WholeDay || (when.From is { } from && when.To is { } to && r.From!.Value.ToTimeSpan() <= from && to <= r.End)));
    }

    /// <summary>The dish's own rules and, for a variant, its main dish's (both must allow it).</summary>
    public static bool IsAvailable(Dish dish, When when) =>
        Allows(dish.AvailabilityRules, when) && (dish.MainDish is null || Allows(dish.MainDish.AvailabilityRules, when));

    public static AvailabilityRuleDto ToDto(DishAvailabilityRule rule) =>
        new(rule.Weekday, rule.WholeDay ? null : rule.From, rule.WholeDay ? null : rule.To);

    public static List<AvailabilityRuleDto> ToDtos(IEnumerable<DishAvailabilityRule> rules) =>
        rules.OrderBy(r => r.Weekday).ThenBy(r => r.From).Select(ToDto).ToList();

    /// <summary>Errors for a list of rules sent by the admin, as codes under <c>availability[i]</c>.</summary>
    public static void Validate(IReadOnlyList<AvailabilityRuleDto>? rules, Controllers.Admin.Errors errors)
    {
        if (rules is null)
            return;
        if (rules.Count > DishAvailabilityRule.MaxPerDish)
            errors.Add("availability", "tooMany");
        for (var i = 0; i < rules.Count; i++)
        {
            var rule = rules[i];
            if (!Enum.IsDefined(rule.Weekday))
                errors.Add($"availability[{i}].weekday", "invalid");
            if ((rule.From is null) != (rule.To is null))
                errors.Add($"availability[{i}].from", "invalid");
            else if (rule.From is { } from && rule.To is { } to)
            {
                var end = to == TimeOnly.MinValue ? TimeSpan.FromDays(1) : to.ToTimeSpan();
                if (end <= from.ToTimeSpan())
                    errors.Add($"availability[{i}].to", "invalid");
            }
        }
    }

    /// <summary>Replaces the dish's rules with the ones sent, dropping duplicates and ranges inside a whole-day rule.</summary>
    public static void Apply(IReadOnlyList<AvailabilityRuleDto> rules, Dish dish)
    {
        var wanted = rules
            .Select(r => r.From is null || r.To is null ? r with { From = null, To = null } : r)
            .Distinct()
            .ToList();
        var wholeDays = wanted.Where(r => r.From is null).Select(r => r.Weekday).ToHashSet();
        wanted = wanted.Where(r => r.From is null || !wholeDays.Contains(r.Weekday)).ToList();

        // Rows that are still wanted stay; the rest go, and new ones are added.
        foreach (var row in dish.AvailabilityRules.ToList())
        {
            var match = wanted.FirstOrDefault(r => r.Weekday == row.Weekday && r.From == row.From && r.To == row.To);
            if (match is null)
                dish.AvailabilityRules.Remove(row);
            else
                wanted.Remove(match);
        }
        foreach (var r in wanted)
            dish.AvailabilityRules.Add(new DishAvailabilityRule { Weekday = r.Weekday, From = r.From, To = r.To });
    }
}
