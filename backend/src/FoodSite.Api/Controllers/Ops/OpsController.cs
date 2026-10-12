using FoodSite.Api.Data;
using FoodSite.Api.Controllers.Admin;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Ops;
using FoodSite.Api.Orders;
using FoodSite.Api.Sites;
using FoodSite.Api.Usage;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace FoodSite.Api.Controllers.Ops;

/// <summary>
/// The console's view into this site (<c>docs/OPS-API.md</c>): its version, sales, client recommendations, the
/// admin's feedback and its feature flags. Signed in only with the site's console token (<see cref="OpsToken"/>).
/// Changes made here are audited as <see cref="OpsToken.Actor"/>.
/// </summary>
[ApiController]
[Route("api/ops")]
[Authorize(AuthenticationSchemes = OpsToken.Scheme, Roles = OpsToken.Role)]
public class OpsController(AppDbContext db, IOptions<SiteOptions> site, FeatureFlags flags, SiteClock clock, UsageReportBuilder usage) : ControllerBase
{
    /// <summary>The most items a list returns, newest first.</summary>
    public const int ListLimit = 500;

    /// <summary>The longest range a summary covers.</summary>
    public const int SummaryMaxDays = 731;

    /// <param name="Commit">The deployed commit (Render's <c>RENDER_GIT_COMMIT</c>); null outside Render.</param>
    /// <param name="Migration">The last migration applied to the site's database.</param>
    /// <param name="PendingMigrations">Migrations this build has that the database does not.</param>
    public record VersionDto(string SiteId, string? Commit, string? Migration, IReadOnlyList<string> PendingMigrations);

    public enum SummaryPeriod
    {
        Day,
        /// <summary>Sunday to Saturday, like the admin's reports.</summary>
        Week,
        Month,
    }

    public record PeriodDto(DateOnly Start, int Orders, decimal Sales);

    /// <summary>Where an order stands, as the summary tells it apart: its status, or <see cref="WaitingApproval"/> while the admin has not approved it.</summary>
    public static class OrderState
    {
        /// <summary>A delivery outside the service area that the admin has not approved yet (not cancelled).</summary>
        public const string WaitingApproval = nameof(WaitingApproval);

        /// <summary>Every state, in the order <see cref="SummaryDto.ByStatus"/> lists them.</summary>
        public static readonly IReadOnlyList<string> All =
            [nameof(OrderStatus.New), nameof(OrderStatus.Confirmed), nameof(OrderStatus.Ready), nameof(OrderStatus.Delivered), WaitingApproval, nameof(OrderStatus.Cancelled)];

        /// <summary>What a summary counts when no <c>statuses</c> are asked for: everything but cancelled.</summary>
        public static readonly IReadOnlyList<string> Default = All.Where(s => s != nameof(OrderStatus.Cancelled)).ToList();

        public static string Of(OrderStatus status, bool needsReview) =>
            status == OrderStatus.Cancelled ? nameof(OrderStatus.Cancelled) : needsReview ? WaitingApproval : status.ToString();
    }

    public record StatusDto(string Status, int Orders, decimal Sales);

    /// <param name="Statuses">The states the totals and periods count.</param>
    /// <param name="ByStatus">Every state's orders and sales in the range, whatever <paramref name="Statuses"/> asks for.</param>
    public record SummaryDto(
        DateOnly From, DateOnly To, SummaryPeriod Period, int Orders, decimal Sales, IReadOnlyList<PeriodDto> Periods,
        IReadOnlyList<string> Statuses, IReadOnlyList<StatusDto> ByStatus);

    public record RecommendationDto(int Id, string Text, string? ClientName, DateTimeOffset CreatedAt, bool IsHandled);

    public record HandledInput(bool IsHandled);

    /// <param name="SiteDefault">What the site's <c>site.json</c> says.</param>
    /// <param name="Overridden">A row in the site's database decides instead of <c>site.json</c>.</param>
    public record FeatureDto(string Name, bool Enabled, bool SiteDefault, bool Overridden);

    /// <param name="Enabled">On or off; null removes the override, so <c>site.json</c> decides again.</param>
    public record FeatureInput(bool? Enabled);

    [HttpGet("version")]
    public async Task<VersionDto> Version(CancellationToken ct)
    {
        var applied = (await db.Database.GetAppliedMigrationsAsync(ct)).ToList();
        var pending = db.Database.GetMigrations().Except(applied).ToList();
        return new VersionDto(site.Value.Id, Environment.GetEnvironmentVariable("RENDER_GIT_COMMIT"), applied.LastOrDefault(), pending);
    }

    /// <summary>
    /// Orders and their totals per period, by supply date. <paramref name="statuses"/> (comma-separated
    /// <see cref="OrderState.All"/>) picks what counts; without it everything but cancelled does, orders waiting for the
    /// admin's approval included. Every state's own count is returned in <c>byStatus</c> either way.
    /// Without dates: the last 12 months up to today.
    /// </summary>
    [HttpGet("summary")]
    public async Task<ActionResult<SummaryDto>> Summary(
        DateOnly? from, DateOnly? to, SummaryPeriod period = SummaryPeriod.Month, string? statuses = null, CancellationToken ct = default)
    {
        var end = to ?? clock.Today();
        var start = from ?? new DateOnly(end.Year, end.Month, 1).AddMonths(-11);
        if (start > end || end.DayNumber - start.DayNumber >= SummaryMaxDays)
            return ValidationProblem(new ValidationProblemDetails(
                new Admin.Errors().Add(nameof(from), "invalidRange").ToDictionary()));

        var counted = OrderState.Default;
        if (!string.IsNullOrWhiteSpace(statuses))
        {
            var asked = statuses.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(s => OrderState.All.FirstOrDefault(known => string.Equals(known, s, StringComparison.OrdinalIgnoreCase)))
                .ToList();
            if (asked.Count == 0 || asked.Any(s => s is null))
                return ValidationProblem(new ValidationProblemDetails(
                    new Admin.Errors().Add(nameof(statuses), "invalid").ToDictionary()));
            counted = OrderState.All.Where(asked.Contains).ToList();
        }

        var all = (await db.Orders.AsNoTracking()
                .Where(o => o.SupplyDate >= start && o.SupplyDate <= end)
                .Select(o => new { o.SupplyDate, o.Total, o.Status, o.NeedsReview })
                .ToListAsync(ct))
            .Select(o => new { o.SupplyDate, o.Total, State = OrderState.Of(o.Status, o.NeedsReview) })
            .ToList();
        var orders = all.Where(o => counted.Contains(o.State)).ToList();
        var periods = orders
            .GroupBy(o => PeriodStart(o.SupplyDate, period))
            .OrderBy(g => g.Key)
            .Select(g => new PeriodDto(g.Key, g.Count(), g.Sum(o => o.Total)))
            .ToList();
        var byStatus = OrderState.All
            .Select(state => new StatusDto(state, all.Count(o => o.State == state), all.Where(o => o.State == state).Sum(o => o.Total)))
            .ToList();
        return new SummaryDto(start, end, period, orders.Count, orders.Sum(o => o.Total), periods, counted, byStatus);
    }

    /// <summary>
    /// How the client site is used between two dates (the admin's usage report): devices that visited, started and
    /// sent an order, registered clients, orders and customers. Without dates: the last 30 days up to today.
    /// </summary>
    [HttpGet("usage")]
    public async Task<ActionResult<UsageReportController.UsageReportDto>> Usage(DateOnly? from, DateOnly? to, CancellationToken ct)
    {
        var end = to ?? clock.Today();
        var start = from ?? end.AddDays(-29);
        if (start > end || end.DayNumber - start.DayNumber + 1 > UsageReportController.MaxDays)
            return ValidationProblem(new ValidationProblemDetails(
                new Admin.Errors().Add(nameof(from), "invalidRange").ToDictionary()));

        return await usage.BuildAsync(start, end, ct);
    }

    internal static DateOnly PeriodStart(DateOnly date, SummaryPeriod period) => period switch
    {
        SummaryPeriod.Day => date,
        SummaryPeriod.Week => Admin.ReportsController.WeekStart(date),
        _ => new DateOnly(date.Year, date.Month, 1),
    };

    /// <param name="handled">Only handled (true) or unhandled (false) ones; all when left out.</param>
    [HttpGet("recommendations")]
    public async Task<IReadOnlyList<RecommendationDto>> Recommendations(bool? handled, CancellationToken ct)
    {
        var query = db.Recommendations.AsNoTracking();
        if (handled is { } h) query = query.Where(r => r.IsHandled == h);
        return await query
            .OrderByDescending(r => r.CreatedAt).ThenByDescending(r => r.Id)
            .Take(ListLimit)
            .Select(r => new RecommendationDto(r.Id, r.Text, r.User!.FullName, r.CreatedAt, r.IsHandled))
            .ToListAsync(ct);
    }

    [HttpPut("recommendations/{id:int}")]
    public async Task<IActionResult> MarkRecommendation(int id, HandledInput input, CancellationToken ct)
    {
        var recommendation = await db.Recommendations.FindAsync([id], ct);
        if (recommendation is null)
            return NotFound();
        recommendation.IsHandled = input.IsHandled;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <param name="handled">Only handled (true) or unhandled (false) ones; all when left out.</param>
    [HttpGet("feedback")]
    public async Task<IReadOnlyList<Admin.FeedbackController.FeedbackDto>> Feedback(bool? handled, CancellationToken ct)
    {
        var query = db.Feedback.AsNoTracking();
        if (handled is { } h) query = query.Where(f => f.IsHandled == h);
        return await query
            .OrderByDescending(f => f.CreatedAt).ThenByDescending(f => f.Id)
            .Take(ListLimit)
            .Select(f => new Admin.FeedbackController.FeedbackDto(f.Id, f.Kind, f.Text, f.Page, f.Actor, f.CreatedAt, f.IsHandled))
            .ToListAsync(ct);
    }

    [HttpPut("feedback/{id:int}")]
    public async Task<IActionResult> MarkFeedback(int id, HandledInput input, CancellationToken ct)
    {
        var feedback = await db.Feedback.FindAsync([id], ct);
        if (feedback is null)
            return NotFound();
        feedback.IsHandled = input.IsHandled;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpGet("features")]
    public async Task<IReadOnlyList<FeatureDto>> GetFeatures(CancellationToken ct)
    {
        var overrides = await db.FeatureFlags.AsNoTracking().ToDictionaryAsync(f => f.Name, f => f.IsEnabled, ct);
        var enabled = await flags.EnabledAsync(ct);
        return Features.All
            .Select(name => new FeatureDto(name, enabled.Contains(name), site.Value.IsEnabledByDefault(name), overrides.ContainsKey(name)))
            .ToList();
    }

    [HttpPut("features/{name}")]
    public async Task<ActionResult<FeatureDto>> SetFeature(string name, FeatureInput input, CancellationToken ct)
    {
        if (!Features.IsKnown(name))
            return NotFound(new { code = "unknownFeature" });

        var row = await db.FeatureFlags.FindAsync([name], ct);
        if (input.Enabled is { } enabled)
        {
            if (row is null)
                db.FeatureFlags.Add(new FeatureFlag { Name = name, IsEnabled = enabled });
            else
                row.IsEnabled = enabled;
        }
        else if (row is not null)
        {
            db.FeatureFlags.Remove(row);
        }
        await db.SaveChangesAsync(ct);

        var siteDefault = site.Value.IsEnabledByDefault(name);
        return new FeatureDto(name, input.Enabled ?? siteDefault, siteDefault, input.Enabled is not null);
    }
}
