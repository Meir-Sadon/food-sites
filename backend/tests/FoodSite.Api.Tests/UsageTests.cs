using System.Net;
using System.Net.Http.Json;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Orders;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static FoodSite.Api.Controllers.Admin.UsageReportController;

namespace FoodSite.Api.Tests;

[Collection(PostgresCollection.Name)]
public sealed class UsageTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string Browser = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
    private const string DeviceA = "0f8e7d6c-5b4a-4321-9876-aabbccddeeff";
    private const string DeviceB = "11111111-2222-4333-8444-555566667777";

    private readonly ApiFactory _factory = new(postgres);
    private HttpClient _admin = null!;
    private HttpClient _guest = null!;
    private DateOnly _today;

    public async Task InitializeAsync()
    {
        _admin = await _factory.CreateAdminClientAsync();
        _guest = _factory.CreateApiClient();
        _guest.DefaultRequestHeaders.UserAgent.ParseAdd(Browser);
        _today = _factory.Services.GetRequiredService<SiteClock>().Today();
    }

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private Task<HttpResponseMessage> Track(HttpClient client, string deviceId, string kind) =>
        client.PostAsJsonAsync("/api/usage", new { deviceId, kind });

    private async Task<UsageReportDto> Report(DateOnly from, DateOnly to) =>
        await _admin.GetAsync($"/api/admin/usage?from={from:yyyy-MM-dd}&to={to:yyyy-MM-dd}").Read<UsageReportDto>();

    [Fact]
    public async Task Each_device_counts_once_per_step()
    {
        foreach (var kind in new[] { "Visit", "Visit", "OrderStarted", "OrderSubmitted" })
            Assert.Equal(HttpStatusCode.NoContent, (await Track(_guest, DeviceA, kind)).StatusCode);
        await Track(_guest, DeviceB, "Visit");
        await Track(_guest, DeviceB, "OrderStarted");

        var report = await Report(_today.AddDays(-6), _today);

        Assert.False(report.Approximate);
        Assert.Equal(new FunnelDto(2, 2, 2, 1), report.Funnel);
        Assert.Equal(2, report.TotalDevices);
        Assert.Equal(7, report.Days.Count);
        Assert.Equal(new DayDto(_today, 2, 2, 1, 0), report.Days[^1]);
    }

    [Fact]
    public async Task The_admin_robots_and_bad_ids_are_not_counted()
    {
        Assert.Equal(HttpStatusCode.NoContent, (await Track(_admin, DeviceA, "Visit")).StatusCode);

        var robot = _factory.CreateApiClient();
        robot.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)");
        Assert.Equal(HttpStatusCode.NoContent, (await Track(robot, DeviceA, "Visit")).StatusCode);

        Assert.Equal(HttpStatusCode.BadRequest, (await Track(_guest, "short", "Visit")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Track(_guest, DeviceA, "Login")).StatusCode);
        var noKind = await _guest.PostAsJsonAsync("/api/usage", new { deviceId = DeviceA });
        Assert.Equal(HttpStatusCode.BadRequest, noKind.StatusCode);

        var report = await Report(_today, _today);
        Assert.Equal(new FunnelDto(0, 0, 0, 0), report.Funnel);
        Assert.Equal(0, report.TotalDevices);
    }

    [Fact]
    public async Task Old_events_are_kept_as_daily_counts_and_pruned()
    {
        var old = _today.AddDays(-100);
        var recent = _today.AddDays(-5);
        await using (var db = _factory.CreateDbContext())
        {
            db.UsageEvents.AddRange(
                new UsageEvent { DeviceId = DeviceA, Kind = UsageEventKind.Visit, Day = old },
                new UsageEvent { DeviceId = DeviceB, Kind = UsageEventKind.Visit, Day = old },
                new UsageEvent { DeviceId = DeviceA, Kind = UsageEventKind.Visit, Day = old.AddDays(1) },
                new UsageEvent { DeviceId = DeviceA, Kind = UsageEventKind.Visit, Day = recent });
            db.UsageDevices.AddRange(
                new UsageDevice { Id = DeviceA, FirstSeen = old, LastSeen = recent },
                new UsageDevice { Id = DeviceB, FirstSeen = old, LastSeen = old });
            await db.SaveChangesAsync();
        }

        var report = await Report(old, _today);

        // Device A came on two of the pruned days, so it counts twice there.
        Assert.True(report.Approximate);
        Assert.Equal(4, report.Funnel.Visitors);
        Assert.Equal(2, report.Funnel.NewVisitors);
        Assert.Equal(2, report.Days[0].Visitors);
        Assert.Equal(1, report.Days.Single(d => d.Day == recent).Visitors);

        // A range inside the kept days is exact again.
        Assert.False((await Report(recent, _today)).Approximate);

        await using (var db = _factory.CreateDbContext())
        {
            Assert.Equal([recent], await db.UsageEvents.Select(e => e.Day).ToListAsync());
            Assert.Equal(3, await db.UsageDays.CountAsync());
        }
    }

    [Fact]
    public async Task Orders_tell_new_and_returning_customers_apart()
    {
        await using (var db = _factory.CreateDbContext())
        {
            var category = new Category { Name = "עופות" };
            var dish = new Dish { Name = "עוף בתנור", Category = category };
            var side = new Dish { Name = "אורז", Category = category };
            db.Dishes.AddRange(dish, side);
            var now = DateTimeOffset.UtcNow;
            Order Sent(string phone, DateTimeOffset at, decimal total, OrderStatus status = OrderStatus.New)
            {
                var order = new Order
                {
                    Phone = phone, Name = "לקוח", Address = "", SupplyDate = _today, Total = total, CreatedAt = at, Status = status,
                };
                order.Items.Add(new OrderItem { Dish = dish, DishName = dish.Name, Quantity = 1, UnitPrice = total - 10, LineTotal = total - 10 });
                order.Items.Add(new OrderItem { Dish = side, DishName = side.Name, Quantity = 1, UnitPrice = 10, LineTotal = 10 });
                return order;
            }
            db.Orders.AddRange(
                Sent("0501111111", now.AddDays(-40), 100), // a customer from before the range...
                Sent("0501111111", now, 80), // ...ordering again
                Sent("0502222222", now, 50), // a new customer...
                Sent("0502222222", now.AddSeconds(-1), 70), // ...who already ordered twice
                Sent("0503333333", now, 999, OrderStatus.Cancelled));
            await db.SaveChangesAsync();
        }

        var report = await Report(_today.AddDays(-6), _today);

        Assert.Equal(new OrdersDto(3, 200, 66.67m, 2, 2, 1, 2), report.Orders);
        Assert.Equal(3, report.OrdersByWeekday.Sum());
        Assert.Equal(3, report.OrdersByHour.Sum());
        Assert.Equal(3, report.Days[^1].Orders);
        Assert.Equal(
            [new DishDto("עוף בתנור", 3, 170), new DishDto("אורז", 3, 30)],
            report.TopDishes);
    }

    [Fact]
    public async Task Registered_clients_count_in_total_and_as_new()
    {
        await using (var db = _factory.CreateDbContext())
        {
            // An account from before registration dates were recorded.
            db.Users.Add(new User { Phone = "0509999999", FullName = "ותיק", Address = "" });
            await db.SaveChangesAsync();
        }
        var register = await _guest.PostAsJsonAsync("/api/account/register", new
        {
            phone = "0501234567", fullName = "דנה", city = "חיפה", street = "הרצל", houseNumber = "1", apartment = "",
        });
        register.EnsureSuccessStatusCode();

        Assert.Equal(new RegisteredDto(2, 1), (await Report(_today, _today)).Registered);
        Assert.Equal(new RegisteredDto(1, 0), (await Report(_today.AddDays(-10), _today.AddDays(-1))).Registered);
    }

    [Fact]
    public async Task The_range_must_be_in_order_and_at_most_a_year()
    {
        Assert.Equal(HttpStatusCode.BadRequest, (await _admin.GetAsync($"/api/admin/usage?from={_today:yyyy-MM-dd}&to={_today.AddDays(-1):yyyy-MM-dd}")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _admin.GetAsync($"/api/admin/usage?from={_today.AddDays(-400):yyyy-MM-dd}&to={_today:yyyy-MM-dd}")).StatusCode);
        Assert.Equal(30, (await _admin.GetAsync("/api/admin/usage").Read<UsageReportDto>()).Days.Count);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _guest.GetAsync("/api/admin/usage")).StatusCode);
    }
}
