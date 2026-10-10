using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Orders;
using FoodSite.Api.Usage;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FoodSite.Api.Controllers.Admin;

/// <summary>
/// How the client site is used between two dates (the business's days, both included): devices that visited,
/// started an order and sent one, registered clients, returning customers, and helper numbers from the orders.
/// Devices are counted once each over the whole range while their events are kept; for days before that only
/// daily counts remain, so a device that came on two of those days counts twice and the answer says so.
/// Orders are counted by the day they were sent; cancelled orders never count.
/// </summary>
[Route("api/admin/usage")]
public class UsageReportController(AppDbContext db, SiteClock clock, UsageRetention retention) : AdminControllerBase
{
    public const int MaxDays = 366;
    public const int TopDishesCount = 10;

    public record FunnelDto(int Visitors, int NewVisitors, int Started, int Submitted);

    public record DayDto(DateOnly Day, int Visitors, int Started, int Submitted, int Orders);

    public record OrdersDto(
        int Orders, decimal Sales, decimal AverageOrder, int Customers, int ReturningCustomers,
        int NewCustomerOrders, int ReturningCustomerOrders);

    public record RegisteredDto(int Total, int New);

    public record DishDto(string DishName, decimal Quantity, decimal Sales);

    public record UsageReportDto(
        DateOnly From,
        DateOnly To,
        /// <summary>True when the range starts before <see cref="KeptSince"/>: a device seen on several of those days counts more than once.</summary>
        bool Approximate,
        DateOnly KeptSince,
        int TotalDevices,
        FunnelDto Funnel,
        RegisteredDto Registered,
        OrdersDto Orders,
        IReadOnlyList<DayDto> Days,
        /// <summary>Orders per weekday, Sunday first.</summary>
        IReadOnlyList<int> OrdersByWeekday,
        /// <summary>Orders per hour of the day they were sent, 0 to 23.</summary>
        IReadOnlyList<int> OrdersByHour,
        IReadOnlyList<DishDto> TopDishes);

    private record OrderRow(int Id, string Phone, decimal Total, DateTimeOffset CreatedAt);

    [HttpGet]
    public async Task<ActionResult<UsageReportDto>> Get(DateOnly? from, DateOnly? to, CancellationToken ct)
    {
        var end = to ?? clock.Today();
        var start = from ?? end.AddDays(-29);
        if (start > end)
            return Invalid(nameof(from), "range");
        if (end.DayNumber - start.DayNumber + 1 > MaxDays)
            return Invalid(nameof(to), "rangeTooLong");

        await retention.RunAsync(ct);
        var keptSince = retention.KeptSince();
        var exact = start >= keptSince;

        // ---------- Devices ----------
        var daily = await DailyDevicesAsync(start, end, ct);
        int Unique(UsageEventKind kind) => daily.Where(d => d.Key.Kind == kind).Sum(d => d.Value);
        var funnel = exact
            ? new FunnelDto(
                await DistinctDevicesAsync(UsageEventKind.Visit, start, end, ct),
                await NewDevicesAsync(start, end, ct),
                await DistinctDevicesAsync(UsageEventKind.OrderStarted, start, end, ct),
                await DistinctDevicesAsync(UsageEventKind.OrderSubmitted, start, end, ct))
            : new FunnelDto(
                Unique(UsageEventKind.Visit), await NewDevicesAsync(start, end, ct),
                Unique(UsageEventKind.OrderStarted), Unique(UsageEventKind.OrderSubmitted));
        var totalDevices = await db.UsageDevices.CountAsync(d => d.FirstSeen <= end, ct);

        // ---------- Registered clients ----------
        var startUtc = clock.StartOf(start);
        var endUtc = clock.StartOf(end.AddDays(1));
        var registered = new RegisteredDto(
            await db.Users.CountAsync(u => u.CreatedAt == null || u.CreatedAt < endUtc, ct),
            await db.Users.CountAsync(u => u.CreatedAt >= startUtc && u.CreatedAt < endUtc, ct));

        // ---------- Orders ----------
        var sent = db.Orders.AsNoTracking().Where(o => o.Status != OrderStatus.Cancelled);
        var orders = await sent
            .Where(o => o.CreatedAt >= startUtc && o.CreatedAt < endUtc)
            .Select(o => new OrderRow(o.Id, o.Phone, o.Total, o.CreatedAt))
            .ToListAsync(ct);
        var phones = orders.Select(o => o.Phone).Distinct().ToList();
        // Every order these customers sent up to the end of the range, to tell new customers from returning ones.
        var history = await sent
            .Where(o => phones.Contains(o.Phone) && o.CreatedAt < endUtc)
            .GroupBy(o => o.Phone)
            .Select(g => new { Phone = g.Key, Count = g.Count(), First = g.Min(o => o.CreatedAt) })
            .ToDictionaryAsync(g => g.Phone, ct);
        var sales = orders.Sum(o => o.Total);
        var newCustomerOrders = orders.Count(o => history[o.Phone].First >= startUtc && o.CreatedAt == history[o.Phone].First);
        var orderSummary = new OrdersDto(
            orders.Count,
            sales,
            orders.Count == 0 ? 0 : Math.Round(sales / orders.Count, 2),
            phones.Count,
            phones.Count(p => history[p].Count > 1),
            newCustomerOrders,
            orders.Count - newCustomerOrders);

        var local = orders.Select(o => clock.ToLocal(o.CreatedAt)).ToList();
        var ordersPerDay = local.GroupBy(DateOnly.FromDateTime).ToDictionary(g => g.Key, g => g.Count());
        var byWeekday = new int[7];
        var byHour = new int[24];
        foreach (var moment in local)
        {
            byWeekday[(int)moment.DayOfWeek]++;
            byHour[moment.Hour]++;
        }

        var days = Enumerable.Range(0, end.DayNumber - start.DayNumber + 1)
            .Select(start.AddDays)
            .Select(day => new DayDto(
                day,
                daily.GetValueOrDefault((day, UsageEventKind.Visit)),
                daily.GetValueOrDefault((day, UsageEventKind.OrderStarted)),
                daily.GetValueOrDefault((day, UsageEventKind.OrderSubmitted)),
                ordersPerDay.GetValueOrDefault(day)))
            .ToList();

        var orderIds = orders.Select(o => o.Id).ToList();
        var topDishes = (await db.OrderItems.AsNoTracking()
                .Where(i => orderIds.Contains(i.OrderId))
                .Select(i => new { i.DishId, i.DishName, i.Quantity, i.LineTotal, i.OrderId })
                .ToListAsync(ct))
            .GroupBy(i => i.DishId)
            .Select(g => new DishDto(g.OrderByDescending(i => i.OrderId).First().DishName, g.Sum(i => i.Quantity), g.Sum(i => i.LineTotal)))
            .OrderByDescending(d => d.Sales).ThenBy(d => d.DishName, StringComparer.Ordinal)
            .Take(TopDishesCount)
            .ToList();

        return new UsageReportDto(
            start, end, !exact, keptSince, totalDevices, funnel, registered, orderSummary, days, byWeekday, byHour, topDishes);
    }

    /// <summary>Devices per day and kind: the daily counts, with today's (not counted yet) from the events.</summary>
    private async Task<Dictionary<(DateOnly Day, UsageEventKind Kind), int>> DailyDevicesAsync(
        DateOnly start, DateOnly end, CancellationToken ct)
    {
        var counted = await db.UsageDays.AsNoTracking()
            .Where(d => d.Day >= start && d.Day <= end)
            .ToDictionaryAsync(d => (d.Day, d.Kind), d => d.Devices, ct);
        var live = await db.UsageEvents.AsNoTracking()
            .Where(e => e.Day >= start && e.Day <= end)
            .GroupBy(e => new { e.Day, e.Kind })
            .Select(g => new { g.Key.Day, g.Key.Kind, Devices = g.Count() })
            .ToListAsync(ct);
        foreach (var row in live)
            counted[(row.Day, row.Kind)] = row.Devices;
        return counted;
    }

    private Task<int> DistinctDevicesAsync(UsageEventKind kind, DateOnly start, DateOnly end, CancellationToken ct) =>
        db.UsageEvents.Where(e => e.Kind == kind && e.Day >= start && e.Day <= end)
            .Select(e => e.DeviceId).Distinct().CountAsync(ct);

    private Task<int> NewDevicesAsync(DateOnly start, DateOnly end, CancellationToken ct) =>
        db.UsageDevices.CountAsync(d => d.FirstSeen >= start && d.FirstSeen <= end, ct);
}
