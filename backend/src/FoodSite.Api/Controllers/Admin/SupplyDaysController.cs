using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FoodSite.Api.Controllers.Admin;

[Route("api/admin/supply-days")]
public class SupplyDaysController(AppDbContext db) : AdminControllerBase
{
    public const int MaxRangesPerDay = 6;

    /// <summary>One range of working hours; a To of 00:00 means midnight, the end of the day.</summary>
    public record HoursDto(TimeOnly From, TimeOnly To);

    /// <summary>Hours are the day's working hours: none, or ranges that each end after they start and don't overlap.</summary>
    public record SupplyDayDto(
        DayOfWeek Weekday, bool Enabled, DayOfWeek CutoffDay, TimeOnly CutoffTime, List<HoursDto>? Hours = null);

    /// <summary>All seven weekdays, Sunday first. Days never saved come back disabled.</summary>
    [HttpGet]
    public async Task<IEnumerable<SupplyDayDto>> Get()
    {
        var saved = await db.SupplyDays.Include(d => d.Hours).AsNoTracking().ToDictionaryAsync(d => d.Weekday);
        return Enum.GetValues<DayOfWeek>().Select(day => saved.TryGetValue(day, out var s)
            ? new SupplyDayDto(s.Weekday, s.Enabled, s.CutoffDay, s.CutoffTime,
                s.Hours.OrderBy(h => h.From).Select(h => new HoursDto(h.From, h.To)).ToList())
            : Default(day));
    }

    [HttpPut]
    public async Task<ActionResult<IEnumerable<SupplyDayDto>>> Update(List<SupplyDayDto> days)
    {
        var errors = new Errors();
        if (days.Count != 7 || days.Select(d => d.Weekday).Distinct().Count() != 7)
            errors.Add("days", "allWeekdaysRequired");
        foreach (var (day, i) in days.Select((d, i) => (d, i)))
        {
            if (!Enum.IsDefined(day.Weekday)) errors.Add($"days[{i}].weekday", "invalid");
            if (!Enum.IsDefined(day.CutoffDay)) errors.Add($"days[{i}].cutoffDay", "invalid");
            var ranges = (day.Hours ?? []).Select(h => new SupplyDayHours { From = h.From, To = h.To }).OrderBy(h => h.From).ToList();
            if (ranges.Count > MaxRangesPerDay || ranges.Any(h => !h.IsValid))
                errors.Add($"days[{i}].hours", "deliveryHoursInvalid");
            else if (ranges.Zip(ranges.Skip(1)).Any(p => p.Second.From.ToTimeSpan() < p.First.End))
                errors.Add($"days[{i}].hours", "deliveryHoursOverlap");
        }
        if (errors.Any)
            return Invalid(errors);

        var saved = await db.SupplyDays.Include(d => d.Hours).ToDictionaryAsync(d => d.Weekday);
        foreach (var day in days)
        {
            if (!saved.TryGetValue(day.Weekday, out var entity))
                db.SupplyDays.Add(entity = new SupplyDay { Weekday = day.Weekday });
            entity.Enabled = day.Enabled;
            entity.CutoffDay = day.CutoffDay;
            entity.CutoffTime = day.CutoffTime;
            // Replace the whole list: the day's ranges are edited as one.
            entity.Hours.Clear();
            foreach (var h in day.Hours ?? [])
                entity.Hours.Add(new SupplyDayHours { From = h.From, To = h.To });
        }
        await db.SaveChangesAsync();
        return Ok(await Get());
    }

    // Until set, ordering for a day closes at 20:00 the evening before.
    private static SupplyDayDto Default(DayOfWeek day) =>
        new(day, false, (DayOfWeek)(((int)day + 6) % 7), new TimeOnly(20, 0), []);
}
