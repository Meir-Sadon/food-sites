using FoodSite.Api.Data;
using FoodSite.Api.Sites;
using Microsoft.EntityFrameworkCore;

namespace FoodSite.Api.Orders;

/// <summary>
/// Applies the Shabbat and holiday rules to a day's working hours: on the eve the hours stop early (or the day is
/// closed), on the last day of a rest period they start late (or the day stays closed). Days in the middle of a rest
/// period (the first day of Rosh Hashana, a holiday that runs into Shabbat) are always closed.
/// </summary>
public class ShabbatSchedule(ShabbatRules.Rules rules, TimeZoneInfo zone)
{
    /// <summary>Tzeit hakochavim: the sun 8.5 degrees below the horizon.</summary>
    private const double NightZenith = 98.5;

    public static async Task<ShabbatSchedule> LoadAsync(AppDbContext db, SiteClock clock, CancellationToken ct = default)
    {
        var json = await db.Settings.AsNoTracking().Select(x => x.ShabbatRules).SingleOrDefaultAsync(ct);
        return new(ShabbatRules.Read(json), clock.Zone);
    }

    public record HoursRange(TimeSpan From, TimeSpan End, bool DeliveryAllowed = true, bool PickupAllowed = true);

    public ShabbatRules.Rules Rules { get; } = rules;

    private ShabbatRules.City? City => ShabbatRules.FindCity(Rules.City);

    public TimeSpan? CandleLighting(DateOnly eve) => City is { } c
        ? JewishCalendar.SunDown(eve, c.Latitude, c.Longitude, zone) - TimeSpan.FromMinutes(c.CandleMinutes)
        : null;

    public TimeSpan? ShabbatEnds(DateOnly last) => City is { } c
        ? JewishCalendar.SunDown(last, c.Latitude, c.Longitude, zone, NightZenith)
        : null;

    /// <summary>
    /// The ranges the day works after the rules, or null when the day is closed. <paramref name="ranges"/> empty means
    /// the day has no hours of its own (the client picks no hour); the rules then cut the whole day.
    /// </summary>
    public IReadOnlyList<HoursRange>? Adjust(DateOnly date, IReadOnlyList<HoursRange> ranges)
    {
        var rest = JewishCalendar.IsRestDay(date);
        var tomorrowRest = JewishCalendar.IsRestDay(date.AddDays(1));
        if (rest && tomorrowRest) return HasRule(Kind(date)) ? null : ranges;
        if (rest)
            return Start(date, ranges, Kind(date));
        if (tomorrowRest)
            return Eve(date, ranges, Kind(date.AddDays(1)));
        return ranges;
    }

    private static bool HasRule(ShabbatRules.Kind k) =>
        k.Eve.Mode != ShabbatRules.None || k.Start.Mode != ShabbatRules.None;

    private ShabbatRules.Kind Kind(DateOnly restDay) =>
        JewishCalendar.IsHoliday(restDay) ? Rules.Holiday : Rules.Shabbat;

    private IReadOnlyList<HoursRange>? Eve(DateOnly date, IReadOnlyList<HoursRange> ranges, ShabbatRules.Kind kind)
    {
        var side = kind.Eve;
        TimeSpan? end = side.Mode switch
        {
            ShabbatRules.Closed => TimeSpan.Zero,
            ShabbatRules.Fixed => ShabbatRules.ParseTime(side.Time),
            ShabbatRules.Before => CandleLighting(date) - TimeSpan.FromHours((double)side.Hours),
            _ => null,
        };
        if (end is null) return ranges;
        var source = ranges.Count > 0 ? ranges : [new HoursRange(TimeSpan.Zero, TimeSpan.FromDays(1))];
        var kept = source.Where(r => r.From < end).Select(r => r with { End = r.End < end ? r.End : end.Value }).ToList();
        return kept.Count == 0 ? null : kept;
    }

    private IReadOnlyList<HoursRange>? Start(DateOnly date, IReadOnlyList<HoursRange> ranges, ShabbatRules.Kind kind)
    {
        var side = kind.Start;
        if (side.Mode == ShabbatRules.None) return ranges;
        if (side.Mode == ShabbatRules.Closed) return null;
        TimeSpan? start = side.Mode switch
        {
            ShabbatRules.Fixed => ShabbatRules.ParseTime(side.Time),
            ShabbatRules.After => ShabbatEnds(date) + TimeSpan.FromHours((double)side.Hours),
            _ => null,
        };
        if (start is null) return ranges;
        var source = ranges.Count > 0 ? ranges : [new HoursRange(TimeSpan.Zero, TimeSpan.FromDays(1))];
        var kept = source.Where(r => r.End > start).Select(r => r with { From = r.From > start ? r.From : start.Value }).ToList();
        return kept.Count == 0 ? null : kept;
    }
}
