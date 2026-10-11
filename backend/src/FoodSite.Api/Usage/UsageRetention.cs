using FoodSite.Api.Data;
using FoodSite.Api.Orders;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace FoodSite.Api.Usage;

/// <summary>
/// Keeps the usage data small: writes each finished day's device counts to <c>UsageDays</c>, then deletes
/// the per-device events older than <see cref="UsageOptions.RawEventDays"/>.
/// </summary>
public class UsageRetention(AppDbContext db, SiteClock clock, IOptions<UsageOptions> options)
{
    /// <summary>The first day whose per-device events are still kept.</summary>
    public DateOnly KeptSince() => clock.Today().AddDays(-Math.Max(1, options.Value.RawEventDays) + 1);

    public async Task RunAsync(CancellationToken ct)
    {
        var today = clock.Today();
        var keptSince = KeptSince();
        // Finished days are counted again while their events are kept, so an event written at midnight still counts.
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"""
            INSERT INTO "UsageDays" ("Day", "Kind", "Devices")
            SELECT "Day", "Kind", COUNT(*) FROM "UsageEvents" WHERE "Day" < {today} GROUP BY "Day", "Kind"
            ON CONFLICT ("Day", "Kind") DO UPDATE SET "Devices" = EXCLUDED."Devices"
            """, ct);
        await db.UsageEvents.Where(e => e.Day < keptSince).ExecuteDeleteAsync(ct);
    }
}

/// <summary>Runs <see cref="UsageRetention"/> every few hours.</summary>
public class UsageRetentionService(IServiceScopeFactory scopes, IOptions<UsageOptions> options, ILogger<UsageRetentionService> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromHours(Math.Max(1, options.Value.RetentionIntervalHours));
        // Let startup (and its migrations) finish first.
        var delay = TimeSpan.FromMinutes(5);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(delay, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                return;
            }
            delay = interval;
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                await scope.ServiceProvider.GetRequiredService<UsageRetention>().RunAsync(stoppingToken);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                logger.LogWarning(e, "Could not prune the usage events");
            }
        }
    }
}
