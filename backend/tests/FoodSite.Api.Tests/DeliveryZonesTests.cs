using System.Net;
using System.Net.Http.Json;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Delivery;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using static FoodSite.Api.Controllers.Admin.CategoriesController;
using static FoodSite.Api.Controllers.Admin.DeliveryZonesController;
using static FoodSite.Api.Controllers.Admin.DishesController;
using static FoodSite.Api.Controllers.Admin.SupplyDaysController;
using static FoodSite.Api.Controllers.DeliveryController;
using static FoodSite.Api.Controllers.OrdersController;
using static FoodSite.Api.Controllers.PublicController;

namespace FoodSite.Api.Tests;

public class DeliveryZonesUnitTests
{
    // A square of 0.1 degrees around the origin, and a smaller one inside it.
    private static string Square(double lat, double lng, double size) =>
        DeliveryZones.Serialize([new(lat, lng), new(lat, lng + size), new(lat + size, lng + size), new(lat + size, lng)]);

    private static DeliveryZone Zone(int id, string name, decimal fee, bool blocked, int priority, double lat, double lng, double size) =>
        new() { Id = id, Name = name, Fee = fee, IsBlocked = blocked, Priority = priority, PolygonJson = Square(lat, lng, size) };

    [Fact]
    public void A_point_in_a_part_of_a_city_gets_that_parts_fee()
    {
        var zones = new[] { Zone(1, "near", 20, false, 0, 0, 0, 0.05), Zone(2, "city", 40, false, 1, 0, 0, 0.1) };
        Assert.Equal(new DeliveryQuote("ok", 20, "near"), DeliveryZones.Quote(zones, new(0.01, 0.01)));
        Assert.Equal(new DeliveryQuote("ok", 40, "city"), DeliveryZones.Quote(zones, new(0.08, 0.08)));
    }

    [Fact]
    public void The_lower_priority_wins_where_zones_overlap_but_a_blocked_zone_always_wins()
    {
        var zones = new[] { Zone(1, "city", 40, false, 0, 0, 0, 0.1), Zone(2, "closed", 0, true, 5, 0.02, 0.02, 0.02) };
        Assert.Equal(new DeliveryQuote("blocked", 0, "closed"), DeliveryZones.Quote(zones, new(0.03, 0.03)));
        Assert.Equal(new DeliveryQuote("ok", 40, "city"), DeliveryZones.Quote(zones, new(0.08, 0.08)));
    }

    [Fact]
    public void A_point_in_no_zone_is_not_delivered_to_and_an_unplaced_address_is_unknown()
    {
        var zones = new[] { Zone(1, "city", 40, false, 0, 0, 0, 0.1) };
        Assert.Equal("blocked", DeliveryZones.Quote(zones, new(5, 5)).Status);
        Assert.Equal("unknown", DeliveryZones.Quote(zones, null).Status);
    }

    [Fact]
    public void Without_zones_delivery_is_free()
    {
        Assert.Equal(new DeliveryQuote("ok", 0, null), DeliveryZones.Quote([], null));
    }

    [Theory]
    [InlineData("[[0,0],[1,1]]")]
    [InlineData("not json")]
    [InlineData("[[0,0],[1,1],[200,3]]")]
    public void A_polygon_needs_three_valid_points(string json) => Assert.Null(DeliveryZones.ParsePolygon(json));
}

[Collection(PostgresCollection.Name)]
public sealed class DeliveryZonesTests(PostgresFixture postgres) : IAsyncLifetime
{
    private readonly ApiFactory _factory = new(postgres);
    private HttpClient _admin = null!;
    private HttpClient _client = null!;
    private int _dish;

    public async Task InitializeAsync()
    {
        _admin = await _factory.CreateAdminClientAsync();
        _client = _factory.CreateApiClient();
        var days = Enum.GetValues<DayOfWeek>().Select(d =>
            new SupplyDayDto(d, true, (DayOfWeek)(((int)d + 6) % 7), new TimeOnly(0, 0)));
        (await _admin.PutAsJsonAsync("/api/admin/supply-days", days, TestFiles.Json)).EnsureSuccessStatusCode();
        var category = await (await _admin.PostAsJsonAsync("/api/admin/categories", new { name = "עופות" })).Read<CategoryDto>();
        _dish = (await (await _admin.PostAsJsonAsync("/api/admin/dishes", new DishInput(
            "בשר טחון", category.Id, null, null, SellBy.Weight, ChoiceMode.Free, 0.5m, 3m, 0.25m, 90m, false, false, null, []),
            TestFiles.Json)).Read<DishDto>()).Id;
    }

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private HttpClient WithFakeGeocoder() => _client;

    private static double[] P(double lat, double lng) => [lat, lng];

    private async Task SaveZones(params ZoneInput[] zones) =>
        (await _admin.PutAsJsonAsync("/api/admin/delivery-zones", new ZonesInput([.. zones]), TestFiles.Json)).EnsureSuccessStatusCode();

    private Task<HttpResponseMessage> UseZones() =>
        _admin.GetAsync("/api/admin/settings").ContinueWith(async t =>
        {
            var settings = await (await t).Content.ReadFromJsonAsync<System.Text.Json.JsonElement>(TestFiles.Json);
            var body = System.Text.Json.Nodes.JsonNode.Parse(settings.GetRawText())!.AsObject();
            body["deliveryPricing"] = "zones";
            return await _admin.PutAsJsonAsync("/api/admin/settings", body, TestFiles.Json);
        }).Unwrap();

    private async Task Configure()
    {
        await SaveZones(
            new ZoneInput(null, "קרוב", 15, false, [P(0, 0), P(0, 0.05), P(0.05, 0.05), P(0.05, 0)]),
            new ZoneInput(null, "רחוק", 35, false, [P(0, 0), P(0, 0.1), P(0.1, 0.1), P(0.1, 0)]),
            new ZoneInput(null, "אין משלוח", 0, true, [P(0.1, 0), P(0.1, 0.05), P(0.15, 0.05), P(0.15, 0)]));
        (await UseZones()).EnsureSuccessStatusCode();
    }

    private async Task<object> Order(HttpClient client, string street, string method = "Delivery")
    {
        var menu = await (await client.GetAsync("/api/menu")).Read<MenuDto>();
        return new
        {
            phone = "0501234567", name = "דנה", city = "אשקלון", street, houseNumber = "1",
            supplyDate = menu.SupplyDates[0].Date.ToString("yyyy-MM-dd"),
            fulfillmentMethod = method, paymentMethod = "OnDelivery",
            items = new[] { new { dishId = _dish, quantity = 1m, addOns = Array.Empty<object>() } },
        };
    }

    [Fact]
    public async Task The_quote_follows_the_zone_the_address_falls_in()
    {
        await Configure();
        var client = WithFakeGeocoder();
        Assert.Equal(new QuoteDto("ok", 15, "קרוב"), await client.PostAsJsonAsync("/api/delivery-quote", new { city = "אשקלון", street = "הרצל", houseNumber = "1" }, TestFiles.Json).Read<QuoteDto>());
        Assert.Equal(new QuoteDto("ok", 35, "רחוק"), await client.PostAsJsonAsync("/api/delivery-quote", new { city = "אשקלון", street = "רוטשילד", houseNumber = "1" }, TestFiles.Json).Read<QuoteDto>());
        Assert.Equal("blocked", (await client.PostAsJsonAsync("/api/delivery-quote", new { city = "אשקלון", street = "הנמל", houseNumber = "1" }, TestFiles.Json).Read<QuoteDto>()).Status);
        Assert.Equal("unknown", (await client.PostAsJsonAsync("/api/delivery-quote", new { city = "אשקלון", street = "לא ידוע", houseNumber = "1" }, TestFiles.Json).Read<QuoteDto>()).Status);
    }

    [Fact]
    public async Task The_order_total_includes_the_fee_and_the_fee_is_saved_on_the_order()
    {
        await Configure();
        var client = WithFakeGeocoder();
        var pickup = await client.PostAsJsonAsync("/api/orders", await Order(client, "הרצל", "Pickup"), TestFiles.Json).Read<ConfirmationDto>();
        var delivery = await client.PostAsJsonAsync("/api/orders", await Order(client, "רוטשילד"), TestFiles.Json).Read<ConfirmationDto>();
        Assert.Equal(0, pickup.DeliveryFee);
        Assert.Equal(35, delivery.DeliveryFee);
        Assert.Equal(pickup.Total + 35, delivery.Total);

        var admin = (await _admin.GetAsync("/api/admin/orders").Read<List<FoodSite.Api.Controllers.Admin.OrdersAdminController.OrderDto>>()).Single(o => o.Id == delivery.Id);
        Assert.Equal(35, admin.DeliveryFee);
        Assert.Equal("רחוק", admin.DeliveryZoneName);
        Assert.Equal(delivery.Total, admin.Total);
    }

    [Fact]
    public async Task An_address_where_there_is_no_delivery_cannot_be_ordered()
    {
        await Configure();
        var client = WithFakeGeocoder();
        var response = await client.PostAsJsonAsync("/api/orders", await Order(client, "הנמל"), TestFiles.Json);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("deliveryNotAvailable", await response.Content.ReadAsStringAsync());
        // Pickup is still possible from the same address.
        (await client.PostAsJsonAsync("/api/orders", await Order(client, "הנמל", "Pickup"), TestFiles.Json)).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task An_address_the_map_cannot_place_waits_for_the_admin_without_a_fee()
    {
        await Configure();
        var client = WithFakeGeocoder();
        var order = await client.PostAsJsonAsync("/api/orders", await Order(client, "לא ידוע"), TestFiles.Json).Read<ConfirmationDto>();
        Assert.True(order.NeedsReview);
        Assert.Equal(0, order.DeliveryFee);
    }

    [Fact]
    public async Task The_simple_setting_adds_no_fee_and_the_quote_says_so()
    {
        await SaveZones(new ZoneInput(null, "קרוב", 15, false, [P(0, 0), P(0, 0.05), P(0.05, 0.05), P(0.05, 0)]));
        var client = WithFakeGeocoder();
        Assert.Equal("none", (await client.PostAsJsonAsync("/api/delivery-quote", new { city = "אשקלון", street = "הרצל", houseNumber = "1" }, TestFiles.Json).Read<QuoteDto>()).Status);
        Assert.Equal(0, (await client.PostAsJsonAsync("/api/orders", await Order(client, "הרצל"), TestFiles.Json).Read<ConfirmationDto>()).DeliveryFee);
        Assert.Equal("simple", (await client.GetAsync("/api/site").Read<SiteDto>()).DeliveryPricing);
    }

    [Fact]
    public async Task Zones_are_checked_when_saved_and_the_list_replaces_the_stored_one()
    {
        var response = await _admin.PutAsJsonAsync("/api/admin/delivery-zones",
            new ZonesInput([new ZoneInput(null, "", -1, false, [P(0, 0), P(1, 1)])]), TestFiles.Json);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        await SaveZones(new ZoneInput(null, "א", 10, false, [P(0, 0), P(0, 1), P(1, 1)]), new ZoneInput(null, "ב", 20, false, [P(0, 0), P(0, 1), P(1, 1)]));
        var saved = await _admin.GetAsync("/api/admin/delivery-zones").Read<List<ZoneDto>>();
        Assert.Equal(["א", "ב"], saved.Select(z => z.Name));
        await SaveZones(new ZoneInput(saved[1].Id, "ב", 25, false, [P(0, 0), P(0, 1), P(1, 1)]));
        var after = await _admin.GetAsync("/api/admin/delivery-zones").Read<List<ZoneDto>>();
        Assert.Equal([(saved[1].Id, 25m)], after.Select(z => (z.Id, z.Fee)));
    }
}
