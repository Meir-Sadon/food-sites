using System.Net.Http.Json;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Marketing;
using FoodSite.Api.Orders;
using Microsoft.EntityFrameworkCore;
using static FoodSite.Api.Controllers.Admin.CategoriesController;
using static FoodSite.Api.Controllers.Admin.DishesController;
using static FoodSite.Api.Controllers.Admin.SettingsController;
using static FoodSite.Api.Controllers.Admin.SupplyDaysController;
using static FoodSite.Api.Controllers.PublicController;

namespace FoodSite.Api.Tests;

[Collection(PostgresCollection.Name)]
public sealed class MarketingTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string Token = "EAAB1234567890abcdefghijklmnop";

    private readonly ApiFactory _factory = new(postgres);
    private HttpClient _admin = null!;

    public async Task InitializeAsync() => _admin = await _factory.CreateAdminClientAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private DishDto? _dish;

    private async Task<DishDto> Dish()
    {
        if (_dish is not null)
            return _dish;
        var category = await (await _admin.PostAsJsonAsync("/api/admin/categories", new { name = "עופות" })).Read<CategoryDto>();
        _dish = await (await _admin.PostAsJsonAsync("/api/admin/dishes", new DishInput(
            "עוף", category.Id, null, null, SellBy.Units, ChoiceMode.Fixed, null, null, null, null, false, false,
            [new OptionInput(null, "יחידה", 1, 40, true)], []), TestFiles.Json)).Read<DishDto>();
        return _dish;
    }

    private async Task<HttpResponseMessage> PlaceOrder(object? marketing)
    {
        var dish = await Dish();
        var days = Enum.GetValues<DayOfWeek>().Select(d => new SupplyDayDto(d, true, (DayOfWeek)(((int)d + 6) % 7), new TimeOnly(0, 0)));
        (await _admin.PutAsJsonAsync("/api/admin/supply-days", days, TestFiles.Json)).EnsureSuccessStatusCode();
        var client = _factory.CreateApiClient();
        var menu = await (await client.GetAsync("/api/menu")).Read<MenuDto>();
        return await client.PostAsJsonAsync("/api/orders", new
        {
            phone = "050-123-4567", name = "דנה", city = "אשקלון", street = "הרצל", houseNumber = "1",
            supplyDate = menu.SupplyDates[0].Date.ToString("yyyy-MM-dd"), fulfillmentMethod = "Delivery", paymentMethod = "OnDelivery",
            items = new[] { new { dishId = dish.Id, optionId = (int?)null, quantity = 2m, addOns = Array.Empty<object>() } },
            marketing,
        }, TestFiles.Json);
    }

    private Task Connect(object ids) => _admin.PutAsJsonAsync("/api/admin/settings/tracking", ids);

    [Fact]
    public async Task The_server_reports_a_sent_order_to_Meta_once_with_the_pixel_id_and_a_token()
    {
        await Connect(new { metaPixelId = "123456789012345", metaAccessToken = Token });
        var response = await PlaceOrder(new { fbp = "fb.1.123.456", fbc = "fb.1.123.abc", sourceUrl = "https://example.com/" });
        response.EnsureSuccessStatusCode();
        var order = await response.Read<Controllers.OrdersController.ConfirmationDto>();

        var sent = Assert.Single(_factory.Meta.Sent);
        Assert.Equal("123456789012345", sent.PixelId);
        Assert.Equal(Token, sent.AccessToken);
        // The browser pixel sends the same id, so Meta counts the order once.
        Assert.Equal($"order-{order.Id}", sent.EventId);
        Assert.Equal(order.Total, sent.Value);
        Assert.Equal("ILS", sent.Currency);
        Assert.Equal("fb.1.123.456", sent.Fbp);
        // SHA-256 of 972501234567: the phone is never sent in the clear.
        Assert.Equal(MarketingNotifier.HashPhone("0501234567"), sent.PhoneHash);
        Assert.DoesNotContain("501234567", sent.PhoneHash);
    }

    [Fact]
    public async Task Nothing_is_sent_without_a_token_or_without_a_pixel_id_and_the_browser_cookies_are_optional()
    {
        await Connect(new { metaPixelId = "123456789012345", metaAccessToken = Token });
        (await PlaceOrder(null)).EnsureSuccessStatusCode();
        var sent = Assert.Single(_factory.Meta.Sent);
        Assert.Null(sent.Fbp);

        await Connect(new { metaAccessToken = "" });
        (await PlaceOrder(new { fbp = "fb.1.1.1" })).EnsureSuccessStatusCode();
        await Connect(new { metaPixelId = "", metaAccessToken = Token });
        (await PlaceOrder(null)).EnsureSuccessStatusCode();
        Assert.Single(_factory.Meta.Sent);
    }

    [Fact]
    public async Task A_failed_report_never_fails_the_order()
    {
        await Connect(new { metaPixelId = "123456789012345", metaAccessToken = Token });
        _factory.Meta.Fail = true;
        (await PlaceOrder(null)).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task The_token_is_never_returned_or_audited_and_the_Ads_tag_is_shown_to_the_site()
    {
        var saved = await (await _admin.PutAsJsonAsync("/api/admin/settings/tracking",
            new { metaPixelId = "123456789012345", metaAccessToken = Token, googleAdsId = "aw-123456789", googleAdsPurchaseLabel = "AbC-dEf_123" })).Read<SettingsDto>();
        Assert.True(saved.Tracking.MetaServerEvents);
        Assert.Equal("AW-123456789", saved.Tracking.GoogleAdsId);
        Assert.Equal("AbC-dEf_123", saved.Tracking.GoogleAdsPurchaseLabel);
        var json = await (await _admin.GetAsync("/api/admin/settings")).Content.ReadAsStringAsync();
        Assert.DoesNotContain(Token, json);
        var site = await (await _factory.CreateApiClient().GetAsync("/api/site")).Content.ReadAsStringAsync();
        Assert.DoesNotContain(Token, site);

        var audit = await (await _admin.GetAsync("/api/admin/audit")).Content.ReadAsStringAsync();
        Assert.DoesNotContain(Token, audit);
        Assert.Contains("MetaAccessToken", audit);
    }
}
