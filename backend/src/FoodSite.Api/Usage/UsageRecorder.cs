using System.Text.RegularExpressions;
using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Orders;
using Microsoft.EntityFrameworkCore;

namespace FoodSite.Api.Usage;

/// <summary>Writes what a device did today, once per device, kind and day.</summary>
public partial class UsageRecorder(AppDbContext db, SiteClock clock)
{
    /// <summary>The browser's random id: letters, digits, '-' and '_' (a UUID fits).</summary>
    public static bool IsDeviceId(string? value) => value is not null && DeviceIdPattern().IsMatch(value);

    /// <summary>Crawlers, link previews and test robots that run the site's script.</summary>
    public static bool IsBot(string? userAgent) =>
        string.IsNullOrWhiteSpace(userAgent) || BotPattern().IsMatch(userAgent);

    public async Task RecordAsync(string deviceId, UsageEventKind kind, CancellationToken ct)
    {
        var day = clock.Today();
        var kindName = kind.ToString();
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"""
            INSERT INTO "UsageEvents" ("DeviceId", "Kind", "Day") VALUES ({deviceId}, {kindName}, {day})
            ON CONFLICT ("Day", "Kind", "DeviceId") DO NOTHING
            """, ct);
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"""
            INSERT INTO "UsageDevices" ("Id", "FirstSeen", "LastSeen") VALUES ({deviceId}, {day}, {day})
            ON CONFLICT ("Id") DO UPDATE SET "LastSeen" = GREATEST("UsageDevices"."LastSeen", EXCLUDED."LastSeen")
            """, ct);
    }

    [GeneratedRegex("^[A-Za-z0-9_-]{16,64}$")]
    private static partial Regex DeviceIdPattern();

    [GeneratedRegex(
        "bot|crawl|spider|slurp|headless|lighthouse|facebookexternalhit|preview|phantomjs|selenium|puppeteer|playwright",
        RegexOptions.IgnoreCase)]
    private static partial Regex BotPattern();
}
