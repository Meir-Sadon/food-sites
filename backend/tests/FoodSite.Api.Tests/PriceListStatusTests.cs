using System.Net;
using System.Net.Http.Json;
using FoodSite.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using static FoodSite.Api.Controllers.AccountController;
using static FoodSite.Api.Controllers.Admin.CategoriesController;
using static FoodSite.Api.Controllers.Admin.DishesController;
using static FoodSite.Api.Controllers.Admin.PriceListsController;
using static FoodSite.Api.Controllers.Admin.SupplyDaysController;
using static FoodSite.Api.Controllers.OrdersController;
using static FoodSite.Api.Controllers.PublicController;

namespace FoodSite.Api.Tests;

/// <summary>Lists assigned by client status, and the order in progress kept on the server that one status reads.</summary>
[Collection(PostgresCollection.Name)]
public sealed class PriceListStatusTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string Phone = "0501234567";
    private const string Lists = "/api/admin/price-lists";

    private readonly ApiFactory _factory = new(postgres);
    private HttpClient _admin = null!;
    private int _chicken;

    public async Task InitializeAsync()
    {
        _admin = await _factory.CreateAdminClientAsync();
        var days = Enum.GetValues<DayOfWeek>().Select(d =>
            new SupplyDayDto(d, true, (DayOfWeek)(((int)d + 6) % 7), new TimeOnly(0, 0)));
        (await _admin.PutAsJsonAsync("/api/admin/supply-days", days, TestFiles.Json)).EnsureSuccessStatusCode();
        var category = await (await _admin.PostAsJsonAsync("/api/admin/categories", new { name = "עופות" })).Read<CategoryDto>();
        _chicken = (await (await _admin.PostAsJsonAsync("/api/admin/dishes", new DishInput(
            "עוף בתנור", category.Id, null, null, SellBy.Units, ChoiceMode.Fixed, null, null, null, null, false, false,
            [new OptionInput(null, "שלם", 1, 70, true)], []), TestFiles.Json)).Read<DishDto>()).Id;
    }

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    /// <summary>A list with the chicken at <paramref name="price"/>, for the given statuses.</summary>
    private async Task<PriceListDto> ListFor(string name, decimal price, StatusesDto statuses)
    {
        var list = await _admin.PostAsJsonAsync(Lists, new PriceListInput(name, null), TestFiles.Json).Read<PriceListDto>();
        (await _admin.PutAsJsonAsync($"{Lists}/{list.Id}/dishes", new DishesInput([new PriceListDishInput(_chicken, 70, price, null, null)]),
            TestFiles.Json)).EnsureSuccessStatusCode();
        return await _admin.PutAsJsonAsync($"{Lists}/{list.Id}/statuses", statuses, TestFiles.Json).Read<PriceListDto>();
    }

    private static StatusesDto Statuses(int? newDays = null, bool noOrders = false, bool midOrder = false, decimal? openAbove = null) =>
        new(newDays, newDays is null ? null : "day", noOrders, midOrder, openAbove);

    private async Task<HttpClient> LoggedIn()
    {
        var response = await _factory.CreateApiClient().PostAsJsonAsync("/api/account/login", new { phone = Phone });
        var cookie = response.Headers.GetValues("Set-Cookie").Single(c => c.StartsWith(ApiFactory.SiteId + "_user=")).Split(';')[0];
        var client = _factory.CreateApiClient();
        client.DefaultRequestHeaders.Add("Cookie", cookie);
        return client;
    }

    private async Task<decimal> ChickenPrice(HttpClient client) =>
        (await client.GetAsync("/api/menu").Read<MenuDto>()).Dishes.Single(d => d.Id == _chicken).Options.Single().Price;

    private async Task<ConfirmationDto> Order(HttpClient client, decimal quantity = 1)
    {
        var menu = await client.GetAsync("/api/menu").Read<MenuDto>();
        return await client.PostAsJsonAsync("/api/orders", new
        {
            phone = Phone, name = "דנה", city = "חיפה", street = "הרצל", houseNumber = "1",
            supplyDate = menu.SupplyDates[0].Date.ToString("yyyy-MM-dd"), fulfillmentMethod = "Pickup", paymentMethod = "OnDelivery",
            items = new object[] { new { dishId = _chicken, optionId = (int?)null, quantity, addOns = Array.Empty<object>() } },
        }, TestFiles.Json).Read<ConfirmationDto>();
    }

    private Task<HttpResponseMessage> SaveCart(HttpClient client, int itemCount) =>
        client.PutAsJsonAsync("/api/account/cart", new CartInput("{\"selections\":{}}", itemCount), TestFiles.Json);

    // ---------- The order in progress ----------

    [Fact]
    public async Task A_logged_in_clients_order_in_progress_is_kept_until_it_is_emptied_or_sent()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateApiClient().GetAsync("/api/account/cart")).StatusCode);
        var client = await LoggedIn();
        Assert.Equal(HttpStatusCode.NoContent, (await client.GetAsync("/api/account/cart")).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await SaveCart(client, 2)).StatusCode);
        var cart = await client.GetAsync("/api/account/cart").Read<CartDto>();
        Assert.Equal(("{\"selections\":{}}", 2), (cart.Content, cart.ItemCount));

        (await SaveCart(client, 0)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NoContent, (await client.GetAsync("/api/account/cart")).StatusCode);

        (await SaveCart(client, 1)).EnsureSuccessStatusCode();
        await Order(client);
        Assert.Equal(HttpStatusCode.NoContent, (await client.GetAsync("/api/account/cart")).StatusCode);

        (await SaveCart(client, 1)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync("/api/account/cart")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.GetAsync("/api/account/cart")).StatusCode);
    }

    [Fact]
    public async Task An_order_in_progress_must_have_content_of_a_reasonable_size()
    {
        var client = await LoggedIn();
        await (await client.PutAsJsonAsync("/api/account/cart", new CartInput("", 1), TestFiles.Json)).AssertInvalid("Content", "required");
        await (await client.PutAsJsonAsync("/api/account/cart", new CartInput(new string('x', SavedCart.ContentMaxLength + 1), 1), TestFiles.Json))
            .AssertInvalid("Content", "tooLong");
    }

    // ---------- Statuses ----------

    [Fact]
    public async Task A_client_with_no_orders_gets_the_list_until_their_first_order()
    {
        await ListFor("ראשונה", 50, Statuses(noOrders: true));
        var client = await LoggedIn();
        Assert.Equal(50, await ChickenPrice(client));
        Assert.Equal(50, (await Order(client)).Items.Single().UnitPrice);
        Assert.Equal(70, await ChickenPrice(client));
        Assert.Equal(70, await ChickenPrice(_factory.CreateApiClient()));
    }

    [Fact]
    public async Task A_new_client_gets_the_list_within_the_period()
    {
        await ListFor("חדשים", 55, Statuses(newDays: 3));
        var client = await LoggedIn();
        Assert.Equal(55, await ChickenPrice(client));

        using (var db = _factory.CreateDbContext())
        {
            var user = await db.Users.SingleAsync(u => u.Phone == Phone);
            user.CreatedAt = DateTimeOffset.UtcNow.AddDays(-4);
            await db.SaveChangesAsync();
        }
        Assert.Equal(70, await ChickenPrice(client));
    }

    [Fact]
    public async Task A_client_in_the_middle_of_an_order_gets_the_list()
    {
        await ListFor("באמצע", 60, Statuses(midOrder: true));
        var client = await LoggedIn();
        Assert.Equal(70, await ChickenPrice(client));
        (await SaveCart(client, 1)).EnsureSuccessStatusCode();
        Assert.Equal(60, await ChickenPrice(client));
    }

    [Fact]
    public async Task A_client_with_an_open_order_above_the_amount_gets_the_list_until_it_is_delivered()
    {
        await ListFor("גדולה", 62, Statuses(openAbove: 100));
        var client = await LoggedIn();
        await Order(client, 1);
        Assert.Equal(70, await ChickenPrice(client));
        var big = await Order(client, 2);
        Assert.Equal(62, await ChickenPrice(client));

        using (var db = _factory.CreateDbContext())
        {
            await db.Orders.Where(o => o.Id == big.Id).ExecuteUpdateAsync(o => o.SetProperty(x => x.Status, OrderStatus.Delivered));
        }
        Assert.Equal(70, await ChickenPrice(client));
    }

    [Fact]
    public async Task A_list_for_the_phone_wins_over_a_cheaper_one_by_status()
    {
        await ListFor("ראשונה", 50, Statuses(noOrders: true));
        var vip = await ListFor("קבועים", 65, Statuses());
        (await _admin.PutAsJsonAsync($"{Lists}/{vip.Id}/phones", new PhonesInput([Phone]), TestFiles.Json)).EnsureSuccessStatusCode();
        Assert.Equal(65, await ChickenPrice(await LoggedIn()));
    }

    [Fact]
    public async Task Statuses_are_checked_saved_and_shown()
    {
        var list = await ListFor("ראשונה", 50, Statuses(newDays: 2, midOrder: true, openAbove: 120));
        Assert.Equal(new StatusesDto(2, "day", false, true, 120), list.Statuses);
        await (await _admin.PutAsJsonAsync($"{Lists}/{list.Id}/statuses", new StatusesDto(0, "year", false, false, -1), TestFiles.Json))
            .AssertInvalid("NewClientsAmount", "invalid");
        var response = await _admin.PutAsJsonAsync($"{Lists}/{list.Id}/statuses", new StatusesDto(2, "year", false, false, -1), TestFiles.Json);
        await response.AssertInvalid("NewClientsUnit", "invalid");
        await response.AssertInvalid("OpenOrderAbove", "invalid");

        var defaultList = (await _admin.GetAsync(Lists).Read<List<PriceListDto>>()).Single(l => l.IsDefault);
        await (await _admin.PutAsJsonAsync($"{Lists}/{defaultList.Id}/statuses", Statuses(noOrders: true), TestFiles.Json))
            .AssertInvalid("NoOrders", "isDefault");
        Assert.Equal(new StatusesDto(null, null, false, false, null), defaultList.Statuses);
    }
}
