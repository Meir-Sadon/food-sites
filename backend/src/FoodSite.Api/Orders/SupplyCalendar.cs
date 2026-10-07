using FoodSite.Api.Data.Entities;

namespace FoodSite.Api.Orders;

/// <summary>Which supply dates a client may pick: an enabled weekday, before its cutoff, not a closed date.</summary>
public static class SupplyCalendar
{
    public const int MaxDates = 6;
    public const int HorizonDays = 60;

    public record OpenDate(DateOnly Date, DateTime Cutoff);

    /// <summary>The last moment ordering for <paramref name="date"/> is possible (local time).</summary>
    public static DateTime CutoffFor(DateOnly date, SupplyDay day)
    {
        var daysBefore = ((int)date.DayOfWeek - (int)day.CutoffDay + 7) % 7;
        return date.AddDays(-daysBefore).ToDateTime(day.CutoffTime);
    }

    public static IReadOnlyList<OpenDate> OpenDates(
        DateTime nowLocal, IEnumerable<SupplyDay> days, IEnumerable<DateOnly> closedDates, int max = MaxDates)
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
            if (nowLocal < cutoff)
                open.Add(new OpenDate(date, cutoff));
        }
        return open;
    }

    public static bool IsOpen(
        DateOnly date, DateTime nowLocal, IEnumerable<SupplyDay> days, IEnumerable<DateOnly> closedDates) =>
        OpenDates(nowLocal, days, closedDates, int.MaxValue).Any(d => d.Date == date);
}

/// <summary>The current time in the business's time zone (Israel unless <c>Site:TimeZone</c> says otherwise).</summary>
public class SiteClock(TimeProvider time, IConfiguration config)
{
    private readonly TimeZoneInfo _zone = Find(config["Site:TimeZone"] ?? "Asia/Jerusalem");

    public DateTime NowLocal() => TimeZoneInfo.ConvertTime(time.GetUtcNow(), _zone).DateTime;

    private static TimeZoneInfo Find(string id)
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
        catch (TimeZoneNotFoundException) { return TimeZoneInfo.Utc; }
        catch (InvalidTimeZoneException) { return TimeZoneInfo.Utc; }
    }
}
