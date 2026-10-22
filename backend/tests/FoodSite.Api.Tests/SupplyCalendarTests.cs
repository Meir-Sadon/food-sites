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

    private static SupplyDay Day(DayOfWeek weekday, TimeOnly from, TimeOnly to)
    {
        var day = new SupplyDay { Weekday = weekday, Enabled = true, CutoffDay = weekday, CutoffTime = new TimeOnly(23, 59) };
        Hours(day, (from, to));
        return day;
    }

    // Thursday 2026-10-08 12:00 to 23:59 followed by Friday 2026-10-09 00:00 to 02:00.
    private static SupplyDay[] Shift() => [Day(DayOfWeek.Thursday, new(12, 0), new(23, 59)), Day(DayOfWeek.Friday, new(0, 0), new(2, 0))];

    [Fact]
    public void A_day_ending_at_the_end_of_the_day_continues_with_the_next_days_opening_slots()
    {
        var thursday = SupplyCalendar.Find(new DateOnly(2026, 10, 8), new DateTime(2026, 10, 5, 9, 0, 0), Shift(), []);
        var after = thursday!.Hours.SkipWhile(h => h.Date is null).ToList();
        Assert.Equal([new TimeOnly(0, 0), new TimeOnly(1, 0)], after.Select(h => h.From));
        Assert.All(after, h => Assert.Equal(new DateOnly(2026, 10, 9), h.Date));
        Assert.Equal(12, thursday.Hours.Count(h => h.Date is null));
    }

    [Fact]
    public void No_continuation_when_the_next_day_is_closed_or_opens_later()
    {
        var closed = SupplyCalendar.Find(new DateOnly(2026, 10, 8), new DateTime(2026, 10, 5, 9, 0, 0), Shift(), [new DateOnly(2026, 10, 9)]);
        Assert.All(closed!.Hours, h => Assert.Null(h.Date));
        var late = new[] { Shift()[0], Day(DayOfWeek.Friday, new(8, 0), new(12, 0)) };
        Assert.All(SupplyCalendar.Find(new DateOnly(2026, 10, 8), new DateTime(2026, 10, 5, 9, 0, 0), late, [])!.Hours, h => Assert.Null(h.Date));
    }

    [Theory]
    [InlineData(15, 4)]
    [InlineData(30, 2)]
    [InlineData(60, 1)]
    public void Slot_length_cuts_each_hour_into_pieces(int minutes, int perHour)
    {
        var day = FridayRule();
        Hours(day, (new(10, 0), new(12, 0)));
        var slots = SupplyCalendar.HourSlots(day.Hours.Select(h => new ShabbatSchedule.HoursRange(h.From.ToTimeSpan(), h.End)), new SlotTiming(minutes));
        Assert.Equal(2 * perHour, slots.Count);
        Assert.Equal(new TimeOnly(12, 0), slots[^1].To);
    }

    [Fact]
    public void Aligned_slots_start_on_round_marks_of_the_slot_length()
    {
        var ranges = new[] { new ShabbatSchedule.HoursRange(new TimeSpan(20, 7, 0), new TimeSpan(22, 10, 0)) };
        var half = SupplyCalendar.HourSlots(ranges, new SlotTiming(30, Align: true));
        Assert.Equal(new TimeOnly(20, 30), half[0].From);
        Assert.Equal(new SupplyCalendar.HourSlot(new(22, 0), new(22, 10)), half[^1]);
        var hour = SupplyCalendar.HourSlots(ranges, new SlotTiming(60, Align: true));
        Assert.Equal(new TimeOnly(21, 0), hour[0].From);
        // Not aligned: the first slot starts when the range does.
        Assert.Equal(new TimeOnly(20, 7), SupplyCalendar.HourSlots(ranges, new SlotTiming(30))[0].From);
    }

    [Fact]
    public void Lead_time_blocks_slots_that_start_too_soon_apart_for_delivery_and_pickup()
    {
        var day = Day(DayOfWeek.Thursday, new(12, 0), new(16, 0));
        var now = new DateTime(2026, 10, 8, 12, 10, 0);
        var timing = new SlotTiming(60, false, DeliveryLeadMinutes: 120, PickupLeadMinutes: 30);
        var open = SupplyCalendar.Find(new DateOnly(2026, 10, 8), now, [day], [], timing: timing)!;
        Assert.Equal([13, 14, 15], open.Hours.Where(h => h.PickupOk).Select(h => h.From.Hour));
        Assert.Equal([15], open.Hours.Where(h => h.DeliveryOk).Select(h => h.From.Hour));
        // Without a lead time a slot is open until it is over.
        Assert.Equal(4, SupplyCalendar.Find(new DateOnly(2026, 10, 8), now, [day], [])!.Hours.Count);
        // When every slot is blocked for both methods the date is not offered.
        Assert.Null(SupplyCalendar.Find(new DateOnly(2026, 10, 8), new DateTime(2026, 10, 8, 14, 45, 0), [day], [], timing: timing));
    }
}
