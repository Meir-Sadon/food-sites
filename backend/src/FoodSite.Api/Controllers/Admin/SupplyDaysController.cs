using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FoodSite.Api.Controllers.Admin;

[Route("api/admin/supply-days")]
public class SupplyDaysController(AppDbContext db) : AdminControllerBase
{
    /// <summary>DeliveryFrom and DeliveryTo are the day's supply hours: both empty, or From before To.</summary>
    public record SupplyDayDto(
        DayOfWeek Weekday, bool Enabled, DayOfWeek CutoffDay, TimeOnly CutoffTime,
        TimeOnly? DeliveryFrom = null, TimeOnly? DeliveryTo = null);

    /// <summary>All seven weekdays, Sunday first. Days never saved come back disabled.</summary>
    [HttpGet]
    public async Task<IEnumerable<SupplyDayDto>> Get()
    {
        var saved = await db.SupplyDays.ToDictionaryAsync(d => d.Weekday);
        return Enum.GetValues<DayOfWeek>().Select(day => saved.TryGetValue(day, out var s)
            ? new SupplyDayDto(s.Weekday, s.Enabled, s.CutoffDay, s.CutoffTime, s.DeliveryFrom, s.DeliveryTo)
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
            if (day.DeliveryFrom is null != day.DeliveryTo is null || day.DeliveryTo <= day.DeliveryFrom)
                errors.Add($"days[{i}].deliveryTo", "deliveryHoursInvalid");
        }
        if (errors.Any)
            return Invalid(errors);

        var saved = await db.SupplyDays.ToDictionaryAsync(d => d.Weekday);
        foreach (var day in days)
        {
            if (!saved.TryGetValue(day.Weekday, out var entity))
                db.SupplyDays.Add(entity = new SupplyDay { Weekday = day.Weekday });
            entity.Enabled = day.Enabled;
            entity.CutoffDay = day.CutoffDay;
            entity.CutoffTime = day.CutoffTime;
            entity.DeliveryFrom = day.DeliveryFrom;
            entity.DeliveryTo = day.DeliveryTo;
        }
        await db.SaveChangesAsync();
        return Ok(await Get());
    }

    // Until set, ordering for a day closes at 20:00 the evening before.
    private static SupplyDayDto Default(DayOfWeek day) =>
        new(day, false, (DayOfWeek)(((int)day + 6) % 7), new TimeOnly(20, 0));
}
