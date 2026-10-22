using FoodSite.Api.Data.Entities;

namespace FoodSite.Api.Orders;

/// <summary>Which supply dates a client may pick: an enabled weekday, before its cutoff, not a closed date.</summary>
public static class SupplyCalendar
{
    public const int MaxDates = 6;
    public const int HorizonDays = 60;

    /// <summary>One hour a client can ask for: <see cref="From"/> to <see cref="To"/> (the last slot of a day may be shorter).</summary>
    public record HourSlot(TimeOnly From, TimeOnly To);

    public record OpenDate(DateOnly Date, DateTime Cutoff, IReadOnlyList<HourSlot> Hours);

    /// <summary>The day's working hours, range by range, cut into one-hour slots; none when the day has no (valid) hours.</summary>
    public static IReadOnlyList<HourSlot> HourSlots(SupplyDay day) =>
        HourSlots(RangesOf(day));

    private static List<ShabbatSchedule.HoursRange> RangesOf(SupplyDay day) =>
        day.Hours.Where(h => h.IsValid).OrderBy(h => h.From).Select(h => new ShabbatSchedule.HoursRange(h.From.ToTimeSpan(), h.End)).ToList();

    public static IReadOnlyList<HourSlot> HourSlots(IEnumerable<ShabbatSchedule.HoursRange> ranges)
    {
        var slots = new List<HourSlot>();
        foreach (var range in ranges)
        {
            var end = range.End;
            // TimeSpan, not TimeOnly, so that a range ending at midnight (24:00) does not wrap.
            for (var start = range.From; start < end; start += TimeSpan.FromHours(1))
            {
                var slotEnd = end - start <= TimeSpan.FromHours(1) ? end : start + TimeSpan.FromHours(1);
                slots.Add(new HourSlot(TimeOnly.FromTimeSpan(start), slotEnd >= TimeSpan.FromDays(1) ? TimeOnly.MinValue : TimeOnly.FromTimeSpan(slotEnd)));
            }
        }
        return slots;
    }

    /// <summary>When <paramref name="slot"/> ends on <paramref name="date"/>; the last slot of a day that ends at midnight ends on the next date.</summary>
    public static DateTime EndOf(DateOnly date, HourSlot slot) =>
        slot.To <= slot.From ? date.AddDays(1).ToDateTime(slot.To) : date.ToDateTime(slot.To);

    /// <summary>The last moment ordering for <paramref name="date"/> is possible (local time).</summary>
    public static DateTime CutoffFor(DateOnly date, SupplyDay day)
    {
        var daysBefore = ((int)date.DayOfWeek - (int)day.CutoffDay + 7) % 7;
        return date.AddDays(-daysBefore).ToDateTime(day.CutoffTime);
    }

    public static IReadOnlyList<OpenDate> OpenDates(
        DateTime nowLocal, IEnumerable<SupplyDay> days, IEnumerable<DateOnly> closedDates, int max = MaxDates,
        ShabbatSchedule? schedule = null)
    {
        var enabled = days.Where(d => d.Enabled).ToDictionary(d => d.Weekday);
        var closed = closedDates.ToHashSet();
        var today = DateOnly.FromDateTime(nowLocal);

        var open = new List<OpenDate>();
        for (var offset = 0; offset <= HorizonDays && open.Count < max; offset++)
        {
            var date = today.AddDays(offset);
            if (!enabled.TryGetValue(date.DayOfWeek, out var day) || closed.Contains(date))
                continue;
            var cutoff = CutoffFor(date, day);
            if (nowLocal >= cutoff)
                continue;
            // Hours already over are left out (the order page and the server both use this list), and a day
            // whose hours have all passed is not offered at all.
            var ranges = RangesOf(day);
            if (schedule is not null)
            {
                var adjusted = schedule.Adjust(date, ranges);
                if (adjusted is null)
                    continue;
                ranges = adjusted.ToList();
            }
            var allSlots = HourSlots(ranges);
            var slots = allSlots.Where(s => EndOf(date, s) > nowLocal).ToList();
            if (allSlots.Count > 0 && slots.Count == 0)
                continue;
            open.Add(new OpenDate(date, cutoff, slots));
        }
        return open;
    }

    public static bool IsOpen(
        DateOnly date, DateTime nowLocal, IEnumerable<SupplyDay> days, IEnumerable<DateOnly> closedDates,
        ShabbatSchedule? schedule = null) =>
        Find(date, nowLocal, days, closedDates, schedule) is not null;

    /// <summary>The open date <paramref name="date"/>, with its hours, or null when it cannot be ordered for.</summary>
    public static OpenDate? Find(
        DateOnly date, DateTime nowLocal, IEnumerable<SupplyDay> days, IEnumerable<DateOnly> closedDates,
        ShabbatSchedule? schedule = null) =>
        OpenDates(nowLocal, days, closedDates, int.MaxValue, schedule).FirstOrDefault(d => d.Date == date);
}

/// <summary>The current time in the business's time zone (Israel unless <c>Site:TimeZone</c> says otherwise).</summary>
public class SiteClock(TimeProvider time, IConfiguration config)
{
    private readonly TimeZoneInfo _zone = Find(config["Site:TimeZone"] ?? "Asia/Jerusalem");

    public TimeZoneInfo Zone => _zone;

    public DateTime NowLocal() => TimeZoneInfo.ConvertTime(time.GetUtcNow(), _zone).DateTime;

    public DateOnly Today() => DateOnly.FromDateTime(NowLocal());

    /// <summary>A moment as the business's wall-clock time.</summary>
    public DateTime ToLocal(DateTimeOffset moment) => TimeZoneInfo.ConvertTime(moment, _zone).DateTime;

    /// <summary>The moment the business's day <paramref name="date"/> starts.</summary>
    public DateTimeOffset StartOf(DateOnly date)
    {
        var local = date.ToDateTime(TimeOnly.MinValue);
        return new DateTimeOffset(local, _zone.GetUtcOffset(local)).ToUniversalTime();
    }

    private static TimeZoneInfo Find(string id)
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
        catch (TimeZoneNotFoundException) { return TimeZoneInfo.Utc; }
        catch (InvalidTimeZoneException) { return TimeZoneInfo.Utc; }
    }
}
