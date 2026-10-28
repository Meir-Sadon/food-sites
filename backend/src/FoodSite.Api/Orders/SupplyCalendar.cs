using FoodSite.Api.Data.Entities;

namespace FoodSite.Api.Orders;

/// <summary>Which supply dates a client may pick: an enabled weekday, before its cutoff, not a closed date.</summary>
public static class SupplyCalendar
{
    public const int MaxDates = 6;
    public const int HorizonDays = 60;

    /// <summary>
    /// One slot a client can ask for: <see cref="From"/> to <see cref="To"/> (the last slot of a range may be shorter).
    /// <see cref="Date"/> is set only on a slot of the next day that continues the day's hours (a day ending at 24:00 followed
    /// by a day starting at 00:00 is one long shift); the others are on the supply date itself. <see cref="DeliveryOk"/> and
    /// <see cref="PickupOk"/> say whether the lead time of that method still allows it.
    /// </summary>
    public record HourSlot(TimeOnly From, TimeOnly To, DateOnly? Date = null, bool DeliveryOk = true, bool PickupOk = true);

    public record OpenDate(DateOnly Date, DateTime Cutoff, IReadOnlyList<HourSlot> Hours);

    /// <summary>The day's working hours, range by range, cut into one-hour slots; none when the day has no (valid) hours.</summary>
    public static IReadOnlyList<HourSlot> HourSlots(SupplyDay day) =>
        HourSlots(RangesOf(day));

    private static List<ShabbatSchedule.HoursRange> RangesOf(SupplyDay day) =>
        day.Hours.Where(h => h.IsValid).OrderBy(h => h.From).Select(h => new ShabbatSchedule.HoursRange(h.From.ToTimeSpan(), h.End)).ToList();

    public static IReadOnlyList<HourSlot> HourSlots(IEnumerable<ShabbatSchedule.HoursRange> ranges, SlotTiming? timing = null)
    {
        timing ??= SlotTiming.Default;
        var step = TimeSpan.FromMinutes(timing.SlotMinutes);
        var slots = new List<HourSlot>();
        foreach (var range in ranges)
        {
            var end = range.End;
            var first = timing.Align ? RoundUp(range.From, step) : range.From;
            // TimeSpan, not TimeOnly, so that a range ending at midnight (24:00) does not wrap.
            for (var start = first; start < end; start += step)
            {
                var slotEnd = timing.Align
                    ? new[] { end, RoundUp(start + TimeSpan.FromTicks(1), step) }.Min()
                    : end - start <= step ? end : start + step;
                slots.Add(new HourSlot(TimeOnly.FromTimeSpan(start), slotEnd >= TimeSpan.FromDays(1) ? TimeOnly.MinValue : TimeOnly.FromTimeSpan(slotEnd)));
            }
        }
        return slots;
    }

    /// <summary>The next multiple of <paramref name="step"/> at or after <paramref name="time"/>.</summary>
    private static TimeSpan RoundUp(TimeSpan time, TimeSpan step) =>
        TimeSpan.FromTicks((time.Ticks + step.Ticks - 1) / step.Ticks * step.Ticks);

    /// <summary>From this time on a range counts as lasting to the end of the day (a day entered as ending at 23:59).</summary>
    private static readonly TimeSpan EndOfDay = new(23, 59, 0);

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
        ShabbatSchedule? schedule = null, SlotTiming? timing = null)
    {
        timing ??= SlotTiming.Default;
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
            var allSlots = HourSlots(ranges, timing).ToList();
            if (allSlots.Count > 0 && ranges.Any(r => r.End >= EndOfDay))
                allSlots.AddRange(Continuation(date.AddDays(1), enabled, closed, schedule, timing));
            var slots = allSlots.Select(s => WithLeadFlags(s, s.Date ?? date, nowLocal, timing)).Where(s => s.DeliveryOk || s.PickupOk).ToList();
            if (allSlots.Count > 0 && slots.Count == 0)
                continue;
            open.Add(new OpenDate(date, cutoff, slots));
        }
        return open;
    }

    /// <summary>
    /// The slots of the day after a day that works until midnight, when that day opens at 00:00: they are offered with the
    /// earlier day as one long shift, marked with their own date. None when that day is closed or does not open at midnight.
    /// </summary>
    private static IEnumerable<HourSlot> Continuation(
        DateOnly next, Dictionary<DayOfWeek, SupplyDay> enabled, HashSet<DateOnly> closed, ShabbatSchedule? schedule, SlotTiming timing)
    {
        if (!enabled.TryGetValue(next.DayOfWeek, out var day) || closed.Contains(next))
            return [];
        IReadOnlyList<ShabbatSchedule.HoursRange>? ranges = RangesOf(day);
        if (schedule is not null)
            ranges = schedule.Adjust(next, ranges);
        if (ranges is null)
            return [];
        var opening = ranges.Where(r => r.From == TimeSpan.Zero).Take(1).ToList();
        return HourSlots(opening, timing).Select(s => s with { Date = next });
    }

    /// <summary>The slot with what each method may still do: with a lead time the slot must start that long from now, otherwise it just must not be over.</summary>
    private static HourSlot WithLeadFlags(HourSlot slot, DateOnly date, DateTime nowLocal, SlotTiming timing)
    {
        bool Allowed(int lead) => lead > 0
            ? date.ToDateTime(slot.From) >= nowLocal.AddMinutes(lead)
            : EndOf(date, slot) > nowLocal;
        return slot with { DeliveryOk = Allowed(timing.DeliveryLeadMinutes), PickupOk = Allowed(timing.PickupLeadMinutes) };
    }

    public static bool IsOpen(
        DateOnly date, DateTime nowLocal, IEnumerable<SupplyDay> days, IEnumerable<DateOnly> closedDates,
        ShabbatSchedule? schedule = null, SlotTiming? timing = null) =>
        Find(date, nowLocal, days, closedDates, schedule, timing) is not null;

    /// <summary>The open date <paramref name="date"/>, with its hours, or null when it cannot be ordered for.</summary>
    public static OpenDate? Find(
        DateOnly date, DateTime nowLocal, IEnumerable<SupplyDay> days, IEnumerable<DateOnly> closedDates,
        ShabbatSchedule? schedule = null, SlotTiming? timing = null) =>
        OpenDates(nowLocal, days, closedDates, int.MaxValue, schedule, timing).FirstOrDefault(d => d.Date == date);
}

/// <summary>The current time in the business's time zone (Israel unless <c>Site:TimeZone</c> says otherwise).</summary>
public class SiteClock(TimeProvider time, IConfiguration config)
{
    private readonly TimeZoneInfo _zone = Find(config["Site:TimeZone"] ?? "Asia/Jerusalem");

    public TimeZoneInfo Zone => _zone;

    public DateTime NowLocal() => TimeZoneInfo.ConvertTime(time.GetUtcNow(), _zone).DateTime;

    public DateTimeOffset UtcNow() => time.GetUtcNow();

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
