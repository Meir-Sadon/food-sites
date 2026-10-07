using System.Net;
using System.Net.Http.Json;
using Kuskus.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using static Kuskus.Api.Controllers.Admin.CategoriesController;
using static Kuskus.Api.Controllers.Admin.DishesController;
using static Kuskus.Api.Controllers.Admin.OrdersAdminController;
using static Kuskus.Api.Controllers.Admin.SupplyDaysController;
using static Kuskus.Api.Controllers.OrdersController;
using static Kuskus.Api.Controllers.PublicController;

namespace Kuskus.Api.Tests;

[Collection(PostgresCollection.Name)]
public sealed class OrdersTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string ClientPhone = "0501234567";

    private readonly ApiFactory _factory = new(postgres);
    private HttpClient _admin = null!;
    private HttpClient _client = null!;

    private int _chicken;
    private int _thigh;
    private int _meat;

    public async Task InitializeAsync()
    {
        _admin = await _factory.CreateAdminClientAsync();
        _client = _factory.CreateApiClient();

        // Every weekday is a supply day that closes at midnight the day before, so the
        // first open date is always one to two days away whatever day the test runs.
        var days = Enum.GetValues<DayOfWeek>().Select(d =>
            new SupplyDayDto(d, true, (DayOfWeek)(((int)d + 6) % 7), new TimeOnly(0, 0)));
        (await _admin.PutAsJsonAsync("/api/admin/supply-days", days, TestFiles.Json)).EnsureSuccessStatusCode();

        var category = await (await _admin.PostAsJsonAsync("/api/admin/categories", new { name = "עופות" })).Read<CategoryDto>();
        _chicken = (await CreateDish(new DishInput(
            "עוף בתנור", category.Id, "טעים", null, SellBy.Units, ChoiceMode.Fixed, null, null, null, null, false, false,
            [new OptionInput(null, "חצי", 1, 40, false), new OptionInput(null, "שלם", 1, 70, true)], []))).Id;
        _thigh = (await CreateDish(new DishInput(
            "ירך", category.Id, null, null, SellBy.Units, ChoiceMode.Fixed, null, null, null, null, true, false,
            [new OptionInput(null, "יחידה", 1, 12, true)], [_chicken]))).Id;
        _meat = (await CreateDish(new DishInput(
            "בשר טחון", category.Id, null, null, SellBy.Weight, ChoiceMode.Free, 0.5m, 3m, 0.25m, 90m, false, false, null, []))).Id;
    }

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private async Task<DishDto> CreateDish(DishInput input) =>
        await (await _admin.PostAsJsonAsync("/api/admin/dishes", input, TestFiles.Json)).Read<DishDto>();

    private async Task<MenuDto> Menu() => await (await _client.GetAsync("/api/menu")).Read<MenuDto>();

    private async Task<object> ValidOrder(Action<Dictionary<string, object?>>? change = null)
    {
        var order = new Dictionary<string, object?>
        {
            ["phone"] = "050-123-4567",
            ["name"] = " דנה ",
            ["city"] = "אשקלון",
            ["street"] = "הרצל",
            ["houseNumber"] = "1",
            ["apartment"] = "4",
            ["supplyDate"] = (await Menu()).SupplyDates[0].Date.ToString("yyyy-MM-dd"),
            ["fulfillmentMethod"] = "Delivery",
            ["paymentMethod"] = "OnDelivery",
            ["notes"] = "בלי חריף",
            ["items"] = new object[]
            {
                new { dishId = _chicken, optionId = (int?)null, quantity = 2m, addOns = new[] { new { dishId = _thigh, optionId = (int?)null, quantity = 3m } } },
                new { dishId = _meat, optionId = (int?)null, quantity = 1.5m, addOns = Array.Empty<object>() },
            },
        };
        change?.Invoke(order);
        return order;
    }

    private Task<HttpResponseMessage> Place(object order) => _client.PostAsJsonAsync("/api/orders", order, TestFiles.Json);

    // ---------- Menu ----------

    [Fact]
    public async Task Menu_lists_categories_dishes_and_open_supply_dates()
    {
        var menu = await Menu();

        Assert.Equal(["עופות"], menu.Categories.Select(c => c.Name));
        Assert.Equal(3, menu.Dishes.Count);
        Assert.Equal([_thigh], menu.Dishes.Single(d => d.Id == _chicken).AddOnDishIds);
        Assert.True(menu.Dishes.Single(d => d.Id == _thigh).IsAddOnOnly);
        Assert.Equal(6, menu.SupplyDates.Count);
        Assert.True(menu.SupplyDates[0].Date > DateOnly.FromDateTime(DateTime.UtcNow));
    }

    [Fact]
    public async Task Removed_dishes_and_closed_dates_leave_the_menu()
    {
        var first = (await Menu()).SupplyDates[0].Date;
        (await _admin.PostAsJsonAsync("/api/admin/closed-dates", new { date = first })).EnsureSuccessStatusCode();
        (await _admin.DeleteAsync($"/api/admin/dishes/{_meat}")).EnsureSuccessStatusCode();

        var menu = await Menu();
        Assert.DoesNotContain(menu.SupplyDates, d => d.Date == first);
        Assert.DoesNotContain(menu.Dishes, d => d.Id == _meat);
    }

    // ---------- Placing orders ----------

    [Fact]
    public async Task Guest_order_is_saved_with_prices_from_the_menu()
    {
        var confirmation = await (await Place(await ValidOrder())).Read<ConfirmationDto>();

        // 2 × 70 + 3 × 12 + 1.5 kg × 90
        Assert.Equal(311m, confirmation.Total);
        Assert.Equal(3, confirmation.Items.Count);
        Assert.Equal([false, true, false], confirmation.Items.Select(i => i.IsAddOn));

        await using var db = _factory.CreateDbContext();
        var order = await db.Orders.Include(o => o.Items).SingleAsync();
        Assert.Equal((ClientPhone, "דנה", OrderStatus.New, false), (order.Phone, order.Name, order.Status, order.IsPaid));
        Assert.Null(order.UserId);
        Assert.Equal(311m, order.Total);
        Assert.Equal(order.Items.Single(i => i.DishId == _chicken).Id, order.Items.Single(i => i.DishId == _thigh).ParentItemId);
        Assert.Equal("שלם", order.Items.Single(i => i.DishId == _chicken).OptionLabel);
    }

    [Fact]
    public async Task Later_price_changes_do_not_touch_a_saved_order()
    {
        await (await Place(await ValidOrder())).Read<ConfirmationDto>();

        var dish = await (await _admin.GetAsync($"/api/admin/dishes/{_meat}")).Read<DishDto>();
        var input = new DishInput(dish.Name, dish.CategoryId, null, null, dish.SellBy, dish.ChoiceMode, 0.5m, 3m, 0.25m, 200m, false, false, null, []);
        (await _admin.PutAsJsonAsync($"/api/admin/dishes/{_meat}", input, TestFiles.Json)).EnsureSuccessStatusCode();

        await using var db = _factory.CreateDbContext();
        Assert.Equal(90m, (await db.OrderItems.SingleAsync(i => i.DishId == _meat)).UnitPrice);
    }

    [Fact]
    public async Task Client_and_every_admin_phone_get_a_whatsapp_message()
    {
        (await _admin.PostAsJsonAsync("/api/admin/notify-phones", new { phone = "0521111111" })).EnsureSuccessStatusCode();
        (await _admin.PostAsJsonAsync("/api/admin/notify-phones", new { phone = "0522222222" })).EnsureSuccessStatusCode();

        var confirmation = await (await Place(await ValidOrder())).Read<ConfirmationDto>();

        Assert.Contains(_factory.WhatsApp.MessagesTo(ClientPhone), m => m.Contains("ההזמנה שלך התקבלה") && m.Contains("₪311"));
        foreach (var phone in new[] { "0521111111", "0522222222" })
            Assert.Contains(_factory.WhatsApp.MessagesTo(phone), m => m.Contains($"הזמנה חדשה #{confirmation.Id}") && m.Contains("₪311"));
    }

    [Fact]
    public async Task Order_is_saved_even_when_whatsapp_fails()
    {
        (await _admin.PostAsJsonAsync("/api/admin/notify-phones", new { phone = "0521111111" })).EnsureSuccessStatusCode();
        var order = await ValidOrder();
        _factory.WhatsApp.FailFor.Add("0521111111");
        _factory.WhatsApp.FailFor.Add(ClientPhone);

        Assert.Equal(HttpStatusCode.OK, (await Place(order)).StatusCode);

        await using var db = _factory.CreateDbContext();
        Assert.Equal(1, await db.Orders.CountAsync());
    }

    [Fact]
    public async Task Transfer_payment_shows_the_payment_phone()
    {
        (await _admin.PutAsJsonAsync("/api/admin/settings", new
        {
            deliveryEnabled = true, pickupEnabled = true, deliveryAreaText = (string?)null, deliveryFeeText = (string?)null,
            kashrutText = (string?)null, paymentPhone = "052-9999999",
        })).EnsureSuccessStatusCode();

        var confirmation = await (await Place(await ValidOrder(o => o["paymentMethod"] = "Transfer"))).Read<ConfirmationDto>();

        Assert.Equal("052-9999999", confirmation.PaymentPhone);
        Assert.Contains(_factory.WhatsApp.MessagesTo(ClientPhone), m => m.Contains("052-9999999"));
    }

    [Fact]
    public async Task Transfer_needs_a_payment_phone_in_settings()
    {
        var response = await Place(await ValidOrder(o => o["paymentMethod"] = "Transfer"));
        await response.AssertInvalid("PaymentMethod", "paymentUnavailable");
    }

    [Fact]
    public async Task Pickup_does_not_need_an_address_but_delivery_does()
    {
        Assert.Equal(HttpStatusCode.OK, (await Place(await ValidOrder(o => { o["fulfillmentMethod"] = "Pickup"; o["city"] = null; o["street"] = null; o["houseNumber"] = null; }))).StatusCode);
        var missing = await Place(await ValidOrder(o => o["street"] = " "));
        await missing.AssertInvalid("Street", "required");
    }

    [Fact]
    public async Task An_order_below_the_minimum_is_rejected_and_one_at_it_passes()
    {
        async Task SetMinimum(decimal minimum) =>
            (await _admin.PutAsJsonAsync("/api/admin/settings", new
            {
                deliveryEnabled = true, pickupEnabled = true, deliveryAreaText = (string?)null, deliveryFeeText = (string?)null,
                kashrutText = (string?)null, paymentPhone = (string?)null, minimumOrderAmount = minimum,
            })).EnsureSuccessStatusCode();

        await SetMinimum(312m);
        await (await Place(await ValidOrder())).AssertInvalid("items", "belowMinimumOrder");

        await SetMinimum(311m);
        Assert.Equal(HttpStatusCode.OK, (await Place(await ValidOrder())).StatusCode);
    }

    [Fact]
    public async Task Disabled_fulfillment_is_rejected()
    {
        (await _admin.PutAsJsonAsync("/api/admin/settings", new
        {
            deliveryEnabled = false, pickupEnabled = true, deliveryAreaText = (string?)null, deliveryFeeText = (string?)null,
            kashrutText = (string?)null, paymentPhone = (string?)null,
        })).EnsureSuccessStatusCode();

        await (await Place(await ValidOrder())).AssertInvalid("FulfillmentMethod", "fulfillmentUnavailable");
    }

    [Fact]
    public async Task Supply_date_must_be_open()
    {
        var closed = (await Menu()).SupplyDates[0].Date;
        (await _admin.PostAsJsonAsync("/api/admin/closed-dates", new { date = closed })).EnsureSuccessStatusCode();
        await (await Place(await ValidOrder(o => o["supplyDate"] = closed.ToString("yyyy-MM-dd")))).AssertInvalid("SupplyDate", "supplyDateUnavailable");

        var past = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-1).ToString("yyyy-MM-dd");
        await (await Place(await ValidOrder(o => o["supplyDate"] = past))).AssertInvalid("SupplyDate", "supplyDateUnavailable");
    }

    [Fact]
    public async Task Order_needs_name_and_items_and_valid_dishes()
    {
        await (await Place(await ValidOrder(o => o["name"] = ""))).AssertInvalid("Name", "required");
        await (await Place(await ValidOrder(o => o["items"] = Array.Empty<object>()))).AssertInvalid("Items", "emptyOrder");

        // The add-on-only dish cannot be ordered on its own, and a sold-out dish cannot be ordered at all.
        await (await Place(await ValidOrder(o => o["items"] = new[] { new { dishId = _thigh, optionId = (int?)null, quantity = 1m, addOns = Array.Empty<object>() } })))
            .AssertInvalid("items[0]", "dishUnavailable");
        (await _admin.PutAsJsonAsync($"/api/admin/dishes/{_meat}/sold-out", new { isSoldOut = true })).EnsureSuccessStatusCode();
        await (await Place(await ValidOrder())).AssertInvalid("items[1]", "dishUnavailable");
    }

    [Fact]
    public async Task A_dish_cannot_be_ordered_past_its_limit_for_a_supply_date()
    {
        var dish = await (await _admin.GetAsync($"/api/admin/dishes/{_chicken}")).Read<DishDto>();
        var input = new DishInput(
            dish.Name, dish.CategoryId, null, null, dish.SellBy, dish.ChoiceMode, null, null, null, null, false, false,
            dish.Options.Select(o => new OptionInput(o.Id, o.Label, o.Amount, o.Price, o.IsDefault)).ToList(), dish.ParentDishIds.ToList(),
            MaxPerSupplyDate: 3);
        (await _admin.PutAsJsonAsync($"/api/admin/dishes/{_chicken}", input, TestFiles.Json)).EnsureSuccessStatusCode();

        // ValidOrder holds 2 chickens: the first fits, a second would make 4 of 3.
        var first = await Place(await ValidOrder());
        first.EnsureSuccessStatusCode();

        // The menu says how much is left on each open date; unlimited dishes carry nothing.
        var menu = await Menu();
        var left = menu.Dishes.Single(d => d.Id == _chicken).Remaining!;
        Assert.Equal(1m, left[menu.SupplyDates[0].Date.ToString("yyyy-MM-dd")]);
        Assert.Equal(3m, left[menu.SupplyDates[1].Date.ToString("yyyy-MM-dd")]);
        Assert.Null(menu.Dishes.Single(d => d.Id == _meat).Remaining);
        await (await Place(await ValidOrder())).AssertInvalid("items", "dishLimitReached");

        // The limit is per supply date, and cancelled orders free their share.
        var otherDate = (await Menu()).SupplyDates[1].Date.ToString("yyyy-MM-dd");
        (await Place(await ValidOrder(o => o["supplyDate"] = otherDate))).EnsureSuccessStatusCode();

        await using (var db = _factory.CreateDbContext())
        {
            var placed = await db.Orders.OrderBy(o => o.Id).FirstAsync();
            placed.Status = OrderStatus.Cancelled;
            await db.SaveChangesAsync();
        }
        (await Place(await ValidOrder())).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task A_delivery_outside_the_service_city_waits_for_approval_and_holds_no_quantity()
    {
        var dish = await (await _admin.GetAsync($"/api/admin/dishes/{_chicken}")).Read<DishDto>();
        var input = new DishInput(
            dish.Name, dish.CategoryId, null, null, dish.SellBy, dish.ChoiceMode, null, null, null, null, false, false,
            dish.Options.Select(o => new OptionInput(o.Id, o.Label, o.Amount, o.Price, o.IsDefault)).ToList(), dish.ParentDishIds.ToList(),
            MaxPerSupplyDate: 3);
        (await _admin.PutAsJsonAsync($"/api/admin/dishes/{_chicken}", input, TestFiles.Json)).EnsureSuccessStatusCode();
        var date = (await Menu()).SupplyDates[0].Date.ToString("yyyy-MM-dd");

        var far = await (await Place(await ValidOrder(o => o["city"] = "חיפה"))).Read<ConfirmationDto>();
        Assert.True(far.NeedsReview);
        // Its 2 chickens are not taken out of the 3 available, and the cooking summary leaves it out.
        Assert.Equal(3m, (await Menu()).Dishes.Single(d => d.Id == _chicken).Remaining![date]);
        Assert.Empty((await _admin.GetAsync($"/api/admin/orders/summary?date={date}").Read<SummaryDto>()).Rows);

        // Approving it makes it count.
        (await _admin.PutAsync($"/api/admin/orders/{far.Id}/approve", null)).EnsureSuccessStatusCode();
        Assert.Equal(1m, (await Menu()).Dishes.Single(d => d.Id == _chicken).Remaining![date]);

        // The service city (spaces ignored) is never flagged.
        var otherDate = (await Menu()).SupplyDates[1].Date.ToString("yyyy-MM-dd");
        var home = await (await Place(await ValidOrder(o => { o["city"] = " אשקלון "; o["supplyDate"] = otherDate; }))).Read<ConfirmationDto>();
        Assert.False(home.NeedsReview);
    }

    [Fact]
    public async Task Order_endpoints_are_open_to_guests_but_need_the_request_header()
    {
        var bare = _factory.CreateClient(new() { HandleCookies = false });
        var response = await bare.PostAsJsonAsync("/api/orders", new { });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await bare.GetAsync("/api/menu")).StatusCode);
    }
}
