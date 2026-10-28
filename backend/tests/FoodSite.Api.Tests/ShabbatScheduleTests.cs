using FoodSite.Api.Orders;
using FoodSite.Api.Sites;
using static FoodSite.Api.Orders.ShabbatSchedule;

namespace FoodSite.Api.Tests;

public class ShabbatScheduleTests
{
    private static readonly TimeZoneInfo Israel = TimeZoneInfo.FindSystemTimeZoneById("Asia/Jerusalem");
    private static readonly IReadOnlyList<HoursRange> Evening = [new(TimeSpan.FromHours(11), TimeSpan.FromDays(1))];

    private static ShabbatSchedule Schedule(
        ShabbatRules.Side? shabbatEve = null, ShabbatRules.Side? shabbatStart = null,
        ShabbatRules.Side? holidayEve = null, ShabbatRules.Side? holidayStart = null, string? city = "tel-aviv") =>
        new(new(city,
            new(shabbatEve ?? new(), shabbatStart ?? new()),
            new(holidayEve ?? new(), holidayStart ?? new())), Israel);

    [Fact]
    public void Sunset_in_tel_aviv_at_midsummer_is_close_to_the_published_time()
    {
        var city = ShabbatRules.FindCity("tel-aviv")!;
        var sunset = JewishCalendar.SunDown(new(2026, 6, 21), city.Latitude, city.Longitude, Israel);
        Assert.InRange(sunset.TotalMinutes, 19 * 60 + 45, 19 * 60 + 53);
    }

    [Fact]
    public void Holidays_follow_the_hebrew_calendar_in_a_leap_and_a_plain_year()
    {
        Assert.True(JewishCalendar.IsHoliday(new(2026, 9, 21)));  // Yom Kippur 5787
        Assert.True(JewishCalendar.IsHoliday(new(2026, 4, 2)));   // Pesach 5786
        Assert.True(JewishCalendar.IsHoliday(new(2027, 4, 22)));  // Pesach 5787 (leap year)
        Assert.True(JewishCalendar.IsHoliday(new(2026, 5, 22)));  // Shavuot 5786
        Assert.False(JewishCalendar.IsHoliday(new(2026, 4, 3)));  // chol hamoed
        Assert.False(JewishCalendar.IsHoliday(new(2026, 10, 7)));
    }

    [Fact]
    public void Without_rules_nothing_changes()
    {
        var schedule = Schedule();
        Assert.Equal(Evening, schedule.Adjust(new(2026, 10, 9), Evening));
        Assert.Equal(Evening, schedule.Adjust(new(2026, 10, 10), Evening));
    }

    [Fact]
    public void Friday_can_stop_at_a_fixed_time_or_hours_before_candle_lighting()
    {
        var fixedTime = Schedule(shabbatEve: new(ShabbatRules.Fixed, "15:00"));
        Assert.Equal([new HoursRange(TimeSpan.FromHours(11), TimeSpan.FromHours(15))], fixedTime.Adjust(new(2026, 10, 9), Evening));

        var relative = Schedule(shabbatEve: new(ShabbatRules.Before, null, 2.5m));
        var candle = relative.CandleLighting(new(2026, 10, 9))!.Value;
        Assert.Equal([new HoursRange(TimeSpan.FromHours(11), candle - TimeSpan.FromHours(2.5))], relative.Adjust(new(2026, 10, 9), Evening));
    }

    [Fact]
    public void Saturday_can_stay_closed_or_open_after_shabbat_ends()
    {
        Assert.Null(Schedule(shabbatStart: new(ShabbatRules.Closed)).Adjust(new(2026, 10, 10), Evening));

        var schedule = Schedule(shabbatStart: new(ShabbatRules.After, null, 0.5m));
        var ends = schedule.ShabbatEnds(new(2026, 10, 10))!.Value;
        Assert.InRange(ends.TotalMinutes, 17 * 60, 19 * 60);
        var start = ends + TimeSpan.FromMinutes(30);
        Assert.Equal([new HoursRange(start, TimeSpan.FromDays(1))], schedule.Adjust(new(2026, 10, 10), [new(TimeSpan.Zero, TimeSpan.FromDays(1))]));
        // Hours that end before it opens leave nothing.
        Assert.Null(schedule.Adjust(new(2026, 10, 10), [new(TimeSpan.FromHours(9), TimeSpan.FromHours(12))]));
    }

    [Fact]
    public void A_day_with_no_hours_of_its_own_is_cut_from_the_whole_day()
    {
        var schedule = Schedule(shabbatEve: new(ShabbatRules.Fixed, "14:00"));
        Assert.Equal([new HoursRange(TimeSpan.Zero, TimeSpan.FromHours(14))], schedule.Adjust(new(2026, 10, 9), []));
    }

    [Fact]
    public void Holidays_use_their_own_rules_and_the_days_between_are_closed()
    {
        // Yom Kippur is Monday 21 September 2026: Sunday is its eve.
        var schedule = Schedule(holidayEve: new(ShabbatRules.Fixed, "13:00"), holidayStart: new(ShabbatRules.Closed));
        Assert.Equal([new HoursRange(TimeSpan.FromHours(11), TimeSpan.FromHours(13))], schedule.Adjust(new(2026, 9, 20), Evening));
        Assert.Null(schedule.Adjust(new(2026, 9, 21), Evening));
        // Rosh Hashana: Saturday 12 and Sunday 13 September; the first day is inside the rest period.
        Assert.Null(schedule.Adjust(new(2026, 9, 12), Evening));
        // The Shabbat rules are not set, so an ordinary Friday is untouched.
        Assert.Equal(Evening, schedule.Adjust(new(2026, 10, 9), Evening));
    }

    [Fact]
    public void Relative_rules_need_a_city_and_whole_or_half_hours()
    {
        var rules = ShabbatRules.Empty with { Shabbat = new(new(ShabbatRules.Before, null, 1.3m), new()) };
        var codes = ShabbatRules.Validate(rules).ToList();
        Assert.Contains(("shabbat.eve.hours", "invalid"), codes);
        Assert.Contains(("city", "required"), codes);
        Assert.Empty(ShabbatRules.Validate(rules with { City = "gedera", Shabbat = new(new(ShabbatRules.Before, null, 1.5m), new()) }));
    }
}
