using FoodSite.Api.Data.Entities;
using FoodSite.Api.Orders;

namespace FoodSite.Api.Tests;

public class SupplyCalendarTests
{
    // Friday 2026-10-09, with ordering closing Wednesday 20:00.
    private static readonly DateOnly Friday = new(2026, 10, 9);

    private static SupplyDay FridayRule(bool enabled = true) => new()
    {
        Weekday = DayOfWeek.Friday,
        Enabled = enabled,
        CutoffDay = DayOfWeek.Wednesday,
        CutoffTime = new TimeOnly(20, 0),
    };

    [Fact]
    public void Cutoff_is_the_chosen_weekday_before_the_supply_day() =>
        Assert.Equal(new DateTime(2026, 10, 7, 20, 0, 0), SupplyCalendar.CutoffFor(Friday, FridayRule()));

    [Fact]
    public void Cutoff_on_the_supply_day_itself_is_allowed()
    {
        var rule = FridayRule();
        rule.CutoffDay = DayOfWeek.Friday;
        rule.CutoffTime = new TimeOnly(8, 0);
        Assert.Equal(new DateTime(2026, 10, 9, 8, 0, 0), SupplyCalendar.CutoffFor(Friday, rule));
    }

    [Fact]
    public void Date_is_open_until_the_cutoff_and_closed_after()
    {
        var days = new[] { FridayRule() };
        Assert.True(SupplyCalendar.IsOpen(Friday, new DateTime(2026, 10, 7, 19, 59, 0), days, []));
        Assert.False(SupplyCalendar.IsOpen(Friday, new DateTime(2026, 10, 7, 20, 0, 0), days, []));
        Assert.False(SupplyCalendar.IsOpen(Friday, new DateTime(2026, 10, 8, 9, 0, 0), days, []));
    }

    [Fact]
    public void After_the_cutoff_the_next_week_is_offered_first()
    {
        var open = SupplyCalendar.OpenDates(new DateTime(2026, 10, 8, 9, 0, 0), [FridayRule()], [], max: 2);
        Assert.Equal([Friday.AddDays(7), Friday.AddDays(14)], open.Select(d => d.Date));
    }

    [Fact]
    public void Closed_dates_and_disabled_weekdays_are_skipped()
    {
        var now = new DateTime(2026, 10, 5, 9, 0, 0);
        var open = SupplyCalendar.OpenDates(now, [FridayRule()], [Friday], max: 1);
        Assert.Equal(Friday.AddDays(7), open.Single().Date);
        Assert.Empty(SupplyCalendar.OpenDates(now, [FridayRule(enabled: false)], []));
    }

    [Fact]
    public void Only_the_requested_number_of_dates_is_returned()
    {
        var days = Enum.GetValues<DayOfWeek>().Select(d => new SupplyDay
        {
            Weekday = d,
            Enabled = true,
            CutoffDay = (DayOfWeek)(((int)d + 6) % 7),
            CutoffTime = new TimeOnly(20, 0),
        });
        var open = SupplyCalendar.OpenDates(new DateTime(2026, 10, 5, 9, 0, 0), days, []);
        Assert.Equal(SupplyCalendar.MaxDates, open.Count);
        // Monday's own cutoff (Sunday 20:00) has passed, so the first open day is Tuesday.
        Assert.Equal(new DateOnly(2026, 10, 6), open[0].Date);
    }

    [Fact]
    public void Hours_are_cut_into_one_hour_slots_with_a_shorter_last_one()
    {
        var day = FridayRule();
        day.DeliveryFrom = new TimeOnly(8, 0);
        day.DeliveryTo = new TimeOnly(10, 30);
        Assert.Equal(
            [new(new(8, 0), new(9, 0)), new(new(9, 0), new(10, 0)), new SupplyCalendar.HourSlot(new(10, 0), new(10, 30))],
            SupplyCalendar.HourSlots(day));

        day.DeliveryTo = new TimeOnly(23, 59);
        day.DeliveryFrom = new TimeOnly(23, 0);
        Assert.Equal([new SupplyCalendar.HourSlot(new(23, 0), new(23, 59))], SupplyCalendar.HourSlots(day));
    }

    [Fact]
    public void A_day_without_valid_hours_has_no_slots()
    {
        var day = FridayRule();
        Assert.Empty(SupplyCalendar.HourSlots(day));
        day.DeliveryFrom = new TimeOnly(10, 0);
        Assert.Empty(SupplyCalendar.HourSlots(day));
        day.DeliveryTo = new TimeOnly(9, 0);
        Assert.Empty(SupplyCalendar.HourSlots(day));
    }

    [Fact]
    public void Open_dates_carry_their_day_s_hours()
    {
        var day = FridayRule();
        day.DeliveryFrom = new TimeOnly(12, 0);
        day.DeliveryTo = new TimeOnly(14, 0);
        var open = SupplyCalendar.Find(Friday, new DateTime(2026, 10, 5, 9, 0, 0), [day], []);
        Assert.Equal([new TimeOnly(12, 0), new TimeOnly(13, 0)], open!.Hours.Select(h => h.From));
    }
}
