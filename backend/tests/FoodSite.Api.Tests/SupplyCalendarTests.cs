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

    private static void Hours(SupplyDay day, params (TimeOnly From, TimeOnly To)[] ranges) =>
        day.Hours = ranges.Select(r => new SupplyDayHours { From = r.From, To = r.To }).ToList();

    [Fact]
    public void Hours_are_cut_into_one_hour_slots_with_a_shorter_last_one()
    {
        var day = FridayRule();
        Hours(day, (new(8, 0), new(10, 30)));
        Assert.Equal(
            [new(new(8, 0), new(9, 0)), new(new(9, 0), new(10, 0)), new SupplyCalendar.HourSlot(new(10, 0), new(10, 30))],
            SupplyCalendar.HourSlots(day));

        Hours(day, (new(23, 0), new(23, 59)));
        Assert.Equal([new SupplyCalendar.HourSlot(new(23, 0), new(23, 59))], SupplyCalendar.HourSlots(day));
    }

    [Fact]
    public void Split_hours_give_slots_for_each_range_and_midnight_ends_the_day()
    {
        var day = FridayRule();
        // 00:00 to 01:00 and 11:00 to 00:00, as one day's hours.
        Hours(day, (new(11, 0), new(0, 0)), (new(0, 0), new(1, 0)));
        var slots = SupplyCalendar.HourSlots(day);
        Assert.Equal(new SupplyCalendar.HourSlot(new(0, 0), new(1, 0)), slots[0]);
        Assert.Equal(new TimeOnly(11, 0), slots[1].From);
        Assert.Equal(14, slots.Count);
        Assert.Equal(new SupplyCalendar.HourSlot(new(23, 0), new(0, 0)), slots[^1]);

        // The last slot ends at midnight, the next date, so it is still open late in the evening.
        day.CutoffDay = DayOfWeek.Friday;
        day.CutoffTime = new TimeOnly(23, 59);
        var open = SupplyCalendar.Find(Friday, new DateTime(2026, 10, 9, 22, 30, 0), [day], []);
        Assert.Equal(new TimeOnly(22, 0), open!.Hours[^2].From);
        Assert.Equal(new TimeOnly(23, 0), open.Hours[^1].From);
    }

    [Fact]
    public void A_day_without_valid_hours_has_no_slots()
    {
        var day = FridayRule();
        Assert.Empty(SupplyCalendar.HourSlots(day));
        Hours(day, (new(10, 0), new(9, 0)));
        Assert.Empty(SupplyCalendar.HourSlots(day));
    }

    [Fact]
    public void Hours_already_over_today_are_left_out_and_a_finished_day_is_not_offered()
    {
        var day = FridayRule();
        day.CutoffDay = DayOfWeek.Friday;
        day.CutoffTime = new TimeOnly(23, 0);
        Hours(day, (new(12, 0), new(15, 0)));

        var midday = SupplyCalendar.Find(Friday, new DateTime(2026, 10, 9, 13, 30, 0), [day], []);
        Assert.Equal([new TimeOnly(13, 0), new TimeOnly(14, 0)], midday!.Hours.Select(h => h.From));

        var evening = new DateTime(2026, 10, 9, 15, 0, 0);
        Assert.Null(SupplyCalendar.Find(Friday, evening, [day], []));
        Assert.Equal(Friday.AddDays(7), SupplyCalendar.OpenDates(evening, [day], [], max: 1).Single().Date);
    }

    [Fact]
    public void Open_dates_carry_their_day_s_hours()
    {
        var day = FridayRule();
        Hours(day, (new(12, 0), new(14, 0)));
        var open = SupplyCalendar.Find(Friday, new DateTime(2026, 10, 5, 9, 0, 0), [day], []);
        Assert.Equal([new TimeOnly(12, 0), new TimeOnly(13, 0)], open!.Hours.Select(h => h.From));
    }
}
