namespace FoodSite.Api.Data.Entities;

/// <summary>
/// One time the dish is sold: a weekday, the whole day or one range of hours in it. A dish with no rules is sold whenever the
/// business works; a dish with rules is sold only in them (independent of the working days and shifts, which still apply on top).
/// </summary>
public class DishAvailabilityRule
{
    public const int MaxPerDish = 60;

    public int Id { get; set; }

    public int DishId { get; set; }
    public Dish? Dish { get; set; }

    public DayOfWeek Weekday { get; set; }

    /// <summary>Both null: the whole day. Otherwise the range From to To, where a To of 00:00 means midnight.</summary>
    public TimeOnly? From { get; set; }
    public TimeOnly? To { get; set; }

    public bool WholeDay => From is null || To is null;

    /// <summary>The end as a time of day, with midnight as 24 hours.</summary>
    public TimeSpan End => To is { } to && to != TimeOnly.MinValue ? to.ToTimeSpan() : TimeSpan.FromDays(1);
}
