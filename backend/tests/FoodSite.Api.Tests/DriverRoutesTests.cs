using System.Net;
using System.Net.Http.Json;
using FoodSite.Api.Data.Entities;
using static FoodSite.Api.Controllers.Admin.DriverRoutesController;
using static FoodSite.Api.Controllers.Admin.OrdersAdminController;
using static FoodSite.Api.Controllers.DriverController;
using DriverRoute = FoodSite.Api.Controllers.DriverController.DriverRouteDto;
using AdminRoute = FoodSite.Api.Controllers.Admin.DriverRoutesController.DriverRouteDto;

namespace FoodSite.Api.Tests;

/// <summary>The driver's link: what it opens, what the driver reports through it, and what the admin then sees.</summary>
[Collection(PostgresCollection.Name)]
public sealed class DriverRoutesTests(PostgresFixture postgres) : IAsyncLifetime
{
    private static readonly DateOnly Day = new(2030, 1, 6);

    private readonly ApiFactory _factory = new(postgres);
    private HttpClient _admin = null!;
    private HttpClient _driver = null!;

    public async Task InitializeAsync()
    {
        _admin = await _factory.CreateAdminClientAsync();
        _driver = _factory.CreateApiClient();
    }

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private async Task<int> SeedOrder(
        DateOnly? date = null, FulfillmentMethod method = FulfillmentMethod.Delivery, OrderStatus status = OrderStatus.Ready,
        bool isPaid = false)
    {
        await using var db = _factory.CreateDbContext();
        var order = new Order
        {
            Phone = "0501234567", Name = "דנה כהן", Address = "הרצל 1, אשקלון", SupplyDate = date ?? Day,
            FulfillmentMethod = method, Status = status, PaymentMethod = PaymentMethod.OnDelivery, Total = 120,
            IsPaid = isPaid, PaidWith = isPaid ? PaidWith.Bit : null, PaymentComment = isPaid ? "אצל המנהל" : null,
            CreatedAt = DateTimeOffset.UtcNow,
        };
        db.Orders.Add(order);
        await db.SaveChangesAsync();
        return order.Id;
    }

    private async Task<AdminRoute> CreateLink(params int[] orderIds) =>
        await _admin.PostAsJsonAsync("/api/admin/driver-routes", new
        {
            date = Day,
            stops = orderIds.Select(id => new { orderId = id, plannedArrival = "12:30:00" }),
        }).Read<AdminRoute>();

    private Task<HttpResponseMessage> Report(string token, int orderId, object input) =>
        _driver.PutAsJsonAsync($"/api/driver/{token}/orders/{orderId}/delivery", input);

    private async Task<OrderDto> AdminOrder(int id) => await _admin.GetAsync($"/api/admin/orders/{id}").Read<OrderDto>();

    [Fact]
    public async Task A_link_opens_its_own_stops_in_the_admins_order()
    {
        var first = await SeedOrder();
        var second = await SeedOrder();
        var other = await SeedOrder();
        var link = await CreateLink(second, first);
        Assert.Equal(32, link.Token.Length);
        Assert.Equal(Day.AddDays(1), link.ValidThrough);

        var route = await _driver.GetAsync($"/api/driver/{link.Token}").Read<DriverRoute>();
        Assert.Equal([second, first], route.Stops.Select(s => s.OrderId));
        Assert.Equal(new TimeOnly(12, 30), route.Stops[0].PlannedArrival);
        Assert.DoesNotContain(route.Stops, s => s.OrderId == other);

        // A stop not on the link is not reachable through it.
        var outside = await Report(link.Token, other, new { outcome = "Delivered" });
        Assert.Equal(HttpStatusCode.NotFound, outside.StatusCode);
    }

    [Fact]
    public async Task Unknown_removed_and_expired_links_open_nothing()
    {
        var order = await SeedOrder();
        var link = await CreateLink(order);

        Assert.Equal(HttpStatusCode.NotFound, (await _driver.GetAsync($"/api/driver/{new string('a', 32)}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _driver.GetAsync("/api/driver/short")).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await _admin.DeleteAsync($"/api/admin/driver-routes/{link.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _driver.GetAsync($"/api/driver/{link.Token}")).StatusCode);

        await using (var db = _factory.CreateDbContext())
        {
            db.DriverRoutes.Add(new Data.Entities.DriverRoute
            {
                Token = new string('b', 32), SupplyDate = new DateOnly(2020, 1, 1), CreatedAt = DateTimeOffset.UtcNow,
                Stops = [new DriverRouteStop { OrderId = order }],
            });
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.NotFound, (await _driver.GetAsync($"/api/driver/{new string('b', 32)}")).StatusCode);
    }

    [Fact]
    public async Task Only_the_admin_creates_links_and_only_for_the_days_live_deliveries()
    {
        var delivery = await SeedOrder();
        var pickup = await SeedOrder(method: FulfillmentMethod.Pickup);
        var cancelled = await SeedOrder(status: OrderStatus.Cancelled);
        var otherDay = await SeedOrder(Day.AddDays(1));

        var anonymous = await _driver.PostAsJsonAsync("/api/admin/driver-routes", new { date = Day, stops = new[] { new { orderId = delivery } } });
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);

        foreach (var id in new[] { pickup, cancelled, otherDay })
        {
            var response = await _admin.PostAsJsonAsync("/api/admin/driver-routes", new { date = Day, stops = new[] { new { orderId = id } } });
            await response.AssertInvalid("stops", "invalid");
        }
        var empty = await _admin.PostAsJsonAsync("/api/admin/driver-routes", new { date = Day, stops = Array.Empty<object>() });
        await empty.AssertInvalid("stops", "invalid");
        var past = await _admin.PostAsJsonAsync("/api/admin/driver-routes", new { date = new DateOnly(2020, 1, 1), stops = new[] { new { orderId = delivery } } });
        await past.AssertInvalid("date", "linkExpired");
    }

    [Fact]
    public async Task The_driver_reports_a_delivery_with_payment_and_the_admin_sees_it()
    {
        var order = await SeedOrder();
        var link = await CreateLink(order);

        var stop = await Report(link.Token, order, new { outcome = "Delivered", paidWith = "Cash", paymentComment = " 200 שטר ", note = "נמסר לשכנה" })
            .Read<DriverStopDto>();
        Assert.Equal((DeliveryOutcome.Delivered, true, PaidWith.Cash, "200 שטר", "נמסר לשכנה"),
            (stop.Outcome!.Value, stop.IsPaid, stop.PaidWith!.Value, stop.PaymentComment, stop.DeliveryNote));

        var seen = await AdminOrder(order);
        Assert.Equal((OrderStatus.Delivered, true, PaidWith.Cash, true), (seen.Status, seen.IsPaid, seen.PaidWith!.Value, seen.PaidByDriver));
        Assert.Equal(DeliveryOutcome.Delivered, seen.Delivery!.Outcome);
        Assert.NotNull(seen.Delivery.ReportedAt);
        Assert.Equal("נמסר לשכנה", seen.Delivery.Note);

        var links = await _admin.GetAsync($"/api/admin/driver-routes?date={Day:yyyy-MM-dd}").Read<List<AdminRoute>>();
        Assert.Equal(1, Assert.Single(links).Reported);

        // Taking the report back takes back the payment the driver recorded.
        var undone = await _driver.DeleteAsync($"/api/driver/{link.Token}/orders/{order}/delivery").Read<DriverStopDto>();
        Assert.Equal((null, false, null), (undone.Outcome, undone.IsPaid, undone.PaidWith));
        Assert.Equal(OrderStatus.Ready, (await AdminOrder(order)).Status);
    }

    [Fact]
    public async Task A_payment_the_admin_recorded_stays_and_its_comment_stays_hidden()
    {
        var order = await SeedOrder(isPaid: true);
        var link = await CreateLink(order);

        var route = await _driver.GetAsync($"/api/driver/{link.Token}").Read<DriverRoute>();
        Assert.Null(route.Stops[0].PaymentComment);

        var stop = await Report(link.Token, order, new { outcome = "Delivered", paidWith = "Cash" }).Read<DriverStopDto>();
        Assert.Equal((true, PaidWith.Bit, false), (stop.IsPaid, stop.PaidWith!.Value, stop.PaidByDriver));
        var notDelivered = await Report(link.Token, order, new { outcome = "NotDelivered", note = "לא היה בבית" }).Read<DriverStopDto>();
        Assert.True(notDelivered.IsPaid);
        Assert.Equal("אצל המנהל", (await AdminOrder(order)).PaymentComment);
    }

    [Fact]
    public async Task Not_delivered_needs_a_note_and_clears_the_drivers_payment()
    {
        var order = await SeedOrder();
        var link = await CreateLink(order);

        await (await Report(link.Token, order, new { outcome = "NotDelivered" })).AssertInvalid("note", "required");
        await (await Report(link.Token, order, new { })).AssertInvalid("outcome", "required");
        await (await Report(link.Token, order, new { outcome = "Delivered", paidWith = "Unknown" })).AssertInvalid("paidWith", "invalid");

        await Report(link.Token, order, new { outcome = "Delivered", paidWith = "Bit" }).Read<DriverStopDto>();
        var stop = await Report(link.Token, order, new { outcome = "NotDelivered", note = "כתובת שגויה" }).Read<DriverStopDto>();
        Assert.Equal((DeliveryOutcome.NotDelivered, false, false), (stop.Outcome!.Value, stop.IsPaid, stop.PaidByDriver));
        Assert.Equal(OrderStatus.Ready, (await AdminOrder(order)).Status);
    }

    [Fact]
    public async Task A_cancelled_order_cannot_be_reported()
    {
        var order = await SeedOrder();
        var link = await CreateLink(order);
        await _admin.PutAsJsonAsync($"/api/admin/orders/{order}/status", new { status = "Cancelled" });

        var route = await _driver.GetAsync($"/api/driver/{link.Token}").Read<DriverRoute>();
        Assert.True(route.Stops[0].Cancelled);
        var response = await Report(link.Token, order, new { outcome = "Delivered" });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task The_driver_adds_a_proof_photo_and_a_new_one_replaces_it()
    {
        var order = await SeedOrder();
        var link = await CreateLink(order);

        var first = await _driver.PostAsync($"/api/driver/{link.Token}/orders/{order}/proof", TestFiles.Upload(TestFiles.Jpeg)).Read<DriverStopDto>();
        Assert.NotNull(first.ProofUrl);
        Assert.Equal($"{ApiFactory.SiteId}/deliveries", Assert.Single(_factory.Images.Uploads).Folder);

        var second = await _driver.PostAsync($"/api/driver/{link.Token}/orders/{order}/proof", TestFiles.Upload(TestFiles.Png, "b.png", "image/png")).Read<DriverStopDto>();
        Assert.NotEqual(first.ProofUrl, second.ProofUrl);
        Assert.Single(_factory.Images.Deleted);
        Assert.Equal(second.ProofUrl, (await AdminOrder(order)).Delivery!.ProofUrl);

        var bad = await _driver.PostAsync($"/api/driver/{link.Token}/orders/{order}/proof", TestFiles.Upload([1, 2, 3], "x.gif", "image/gif"));
        await bad.AssertInvalid("file", "imageType");

        var removed = await _driver.DeleteAsync($"/api/driver/{link.Token}/orders/{order}/proof").Read<DriverStopDto>();
        Assert.Null(removed.ProofUrl);
        Assert.Equal(2, _factory.Images.Deleted.Count);
    }

    [Fact]
    public async Task Marking_paid_in_the_admin_takes_the_payment_over_from_the_driver()
    {
        var order = await SeedOrder();
        var link = await CreateLink(order);
        await Report(link.Token, order, new { outcome = "Delivered", paidWith = "Cash" }).Read<DriverStopDto>();

        await _admin.PutAsJsonAsync($"/api/admin/orders/{order}/paid", new { isPaid = true, paidWith = "Bit" });
        Assert.False((await AdminOrder(order)).PaidByDriver);
    }
}
