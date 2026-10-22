using FoodSite.Api.Data;
using FoodSite.Api.Orders;
using FoodSite.Api.Sites;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using static FoodSite.Api.Controllers.Admin.Ordering;

namespace FoodSite.Api.Controllers.Admin;

/// <summary>How the working hours change on the eve of Shabbat and holidays and when they start again after.</summary>
[Route("api/admin/shabbat-rules")]
public class ShabbatRulesController(AppDbContext db, SiteClock clock) : AdminControllerBase
{
    public record CityDto(string Id, string Name);

    /// <summary>The coming Shabbat in the chosen city, so the owner can see what "2 hours before" means; null without a city.</summary>
    public record PreviewDto(DateOnly Eve, string CandleLighting, string ShabbatEnds);

    public record RulesDto(ShabbatRules.Rules Rules, IReadOnlyList<CityDto> Cities, PreviewDto? Preview);

    [HttpGet]
    public async Task<RulesDto> Get() => await Build(ShabbatRules.Read(await db.Settings.AsNoTracking().Select(s => s.ShabbatRules).SingleAsync()));

    [HttpPut]
    public async Task<ActionResult<RulesDto>> Update(ShabbatRules.Rules input)
    {
        var rules = ShabbatRules.Clean(input);
        var errors = new Errors();
        foreach (var (field, code) in ShabbatRules.Validate(rules))
            errors.Add(field, code);
        if (errors.Any)
            return Invalid(errors);

        var settings = await db.Settings.SingleAsync();
        settings.ShabbatRules = ShabbatRules.Write(rules);
        await db.SaveChangesAsync();
        return await Build(rules);
    }

    private Task<RulesDto> Build(ShabbatRules.Rules rules)
    {
        PreviewDto? preview = null;
        var schedule = new ShabbatSchedule(rules, clock.Zone);
        var eve = clock.Today();
        while (eve.DayOfWeek != DayOfWeek.Friday) eve = eve.AddDays(1);
        if (schedule.CandleLighting(eve) is { } candle && schedule.ShabbatEnds(eve.AddDays(1)) is { } ends)
            preview = new(eve, Format(candle), Format(ends));
        return Task.FromResult(new RulesDto(rules, ShabbatRules.Cities.Select(c => new CityDto(c.Id, c.Name)).ToList(), preview));
    }

    private static string Format(TimeSpan t) => $"{(int)t.TotalHours:00}:{t.Minutes:00}";
}
