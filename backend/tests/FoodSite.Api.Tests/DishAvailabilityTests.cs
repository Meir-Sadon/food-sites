using FoodSite.Api.Controllers.Admin;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Orders;

namespace FoodSite.Api.Tests;

public class DishAvailabilityTests
{
    // 2026-10-29 is a Thursday.
    private static readonly DateOnly Thursday = new(2026, 10, 29);

    private static DishAvailabilityRule Rule(DayOfWeek day, string? from = null, string? to = null) =>
        new() { Weekday = day, From = from is null ? null : TimeOnly.Parse(from), To = to is null ? null : TimeOnly.Parse(to) };

    private static DishAvailability.When Slot(string from, string to, DateOnly? date = null) =>
        DishAvailability.Of(date ?? Thursday, new SupplyCalendar.HourSlot(TimeOnly.Parse(from), TimeOnly.Parse(to)));

    [Fact]
    public void A_dish_without_rules_is_sold_whenever()
    {
        Assert.True(DishAvailability.Allows([], Slot("08:00", "09:00")));
        Assert.True(DishAvailability.Allows([], DishAvailability.Of(Thursday, null)));
    }

    [Fact]
    public void A_whole_day_rule_covers_every_hour_of_that_weekday_only()
    {
        var rules = new[] { Rule(DayOfWeek.Thursday) };
        Assert.True(DishAvailability.Allows(rules, Slot("07:00", "08:00")));
        Assert.True(DishAvailability.Allows(rules, DishAvailability.Of(Thursday, null)));
        Assert.False(DishAvailability.Allows(rules, Slot("07:00", "08:00", Thursday.AddDays(1))));
    }

    [Fact]
    public void A_slot_must_lie_inside_a_range()
    {
        var rules = new[] { Rule(DayOfWeek.Thursday, "08:00", "12:00") };
        Assert.True(DishAvailability.Allows(rules, Slot("08:00", "09:00")));
        Assert.True(DishAvailability.Allows(rules, Slot("11:00", "12:00")));
        Assert.False(DishAvailability.Allows(rules, Slot("07:00", "08:00")));
        Assert.False(DishAvailability.Allows(rules, Slot("11:30", "12:30")));
        Assert.False(DishAvailability.Allows(rules, Slot("12:00", "13:00")));
    }

    [Fact]
    public void A_day_without_hours_matches_only_whole_day_rules()
    {
        var day = DishAvailability.Of(Thursday, null);
        Assert.False(DishAvailability.Allows([Rule(DayOfWeek.Thursday, "08:00", "12:00")], day));
        Assert.True(DishAvailability.Allows([Rule(DayOfWeek.Thursday, "08:00", "12:00"), Rule(DayOfWeek.Thursday)], day));
    }

    [Fact]
    public void A_range_ending_at_midnight_covers_the_evening_and_any_rule_may_match()
    {
        var rules = new[] { Rule(DayOfWeek.Thursday, "18:00", "00:00"), Rule(DayOfWeek.Friday, "08:00", "10:00") };
        Assert.True(DishAvailability.Allows(rules, Slot("23:00", "00:00")));
        Assert.True(DishAvailability.Allows(rules, Slot("08:00", "09:00", Thursday.AddDays(1))));
        Assert.False(DishAvailability.Allows(rules, Slot("17:00", "18:00")));
    }

    [Fact]
    public void A_slot_after_midnight_counts_on_the_day_it_falls_on()
    {
        var slot = DishAvailability.Of(Thursday, new SupplyCalendar.HourSlot(TimeOnly.Parse("00:00"), TimeOnly.Parse("01:00"), Thursday.AddDays(1)));
        Assert.True(DishAvailability.Allows([Rule(DayOfWeek.Friday)], slot));
        Assert.False(DishAvailability.Allows([Rule(DayOfWeek.Thursday)], slot));
    }

    [Fact]
    public void A_variant_needs_its_main_dish_to_be_sold_too()
    {
        var main = new Dish { Name = "ראשית", AvailabilityRules = [Rule(DayOfWeek.Thursday)] };
        var variant = new Dish { Name = "וריאנט", MainDish = main };
        Assert.True(DishAvailability.IsAvailable(variant, Slot("08:00", "09:00")));
        Assert.False(DishAvailability.IsAvailable(variant, Slot("08:00", "09:00", Thursday.AddDays(1))));
    }

    [Fact]
    public void Apply_replaces_the_rules_dropping_duplicates_and_ranges_inside_a_whole_day()
    {
        var dish = new Dish { Name = "מנה", AvailabilityRules = [Rule(DayOfWeek.Sunday), Rule(DayOfWeek.Monday, "08:00", "10:00")] };
        var kept = dish.AvailabilityRules[0];
        DishAvailability.Apply([
            new(DayOfWeek.Sunday), new(DayOfWeek.Sunday), new(DayOfWeek.Sunday, TimeOnly.Parse("08:00"), TimeOnly.Parse("09:00")),
            new(DayOfWeek.Tuesday, TimeOnly.Parse("08:00"), TimeOnly.Parse("09:00")),
        ], dish);

        Assert.Equal(2, dish.AvailabilityRules.Count);
        Assert.Contains(kept, dish.AvailabilityRules);
        Assert.Contains(dish.AvailabilityRules, r => r.Weekday == DayOfWeek.Tuesday && !r.WholeDay);
    }

    [Fact]
    public void Validate_refuses_half_ranges_and_backwards_ranges()
    {
        var errors = new Errors();
        DishAvailability.Validate([
            new(DayOfWeek.Sunday, TimeOnly.Parse("08:00"), null),
            new(DayOfWeek.Monday, TimeOnly.Parse("12:00"), TimeOnly.Parse("08:00")),
            new(DayOfWeek.Tuesday, TimeOnly.Parse("12:00"), TimeOnly.Parse("00:00")),
        ], errors);
        var found = errors.ToDictionary();
        Assert.Contains("invalid", found["availability[0].from"]);
        Assert.Contains("invalid", found["availability[1].to"]);
        Assert.False(found.ContainsKey("availability[2].to"));
    }

    [Fact]
    public void The_order_builder_refuses_a_dish_not_sold_at_the_chosen_time()
    {
        var dish = new Dish
        {
            Id = 1, Name = "עוף", SellBy = SellBy.Units, ChoiceMode = ChoiceMode.Fixed,
            Options = [new DishOption { Id = 10, DishId = 1, Label = "מנה", Amount = 1, Price = 40, IsDefault = true }],
            AvailabilityRules = [Rule(DayOfWeek.Thursday, "08:00", "12:00")],
        };
        var dishes = new Dictionary<int, Dish> { [1] = dish };
        var line = new OrderLineInput(1, null, 1, null);

        var fine = new Errors();
        OrderBuilder.Build([line], dishes, fine, Slot("09:00", "10:00"));
        Assert.False(fine.Any);

        var late = new Errors();
        OrderBuilder.Build([line], dishes, late, Slot("13:00", "14:00"));
        Assert.Contains("dishUnavailable", late.ToDictionary()["items[0]"]);

        var unchecked_ = new Errors();
        OrderBuilder.Build([line], dishes, unchecked_);
        Assert.False(unchecked_.Any);
    }
}
