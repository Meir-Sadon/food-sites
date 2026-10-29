using System.Net.Http.Json;
using static FoodSite.Api.Controllers.Admin.CategoriesController;
using static FoodSite.Api.Controllers.Admin.DishesController;
using static FoodSite.Api.Controllers.Admin.PriceListsController;
using static FoodSite.Api.Controllers.Admin.SupplyDaysController;
using static FoodSite.Api.Controllers.OrdersController;
using static FoodSite.Api.Controllers.PublicController;
using FoodSite.Api.Data.Entities;

namespace FoodSite.Api.Tests;

/// <summary>A price list's general discount on the whole menu, through the menu and orders.</summary>
[Collection(PostgresCollection.Name)]
public sealed class PriceListDiscountTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string Phone = "0501234567";
    private const string Lists = "/api/admin/price-lists";

    private readonly ApiFactory _factory = new(postgres);
    private HttpClient _admin = null!;
    private int _category;
    private int _chicken;
    private int _meat;

    public async Task InitializeAsync()
    {
        _admin = await _factory.CreateAdminClientAsync();
        var days = Enum.GetValues<DayOfWeek>().Select(d =>
            new SupplyDayDto(d, true, (DayOfWeek)(((int)d + 6) % 7), new TimeOnly(0, 0)));
        (await _admin.PutAsJsonAsync("/api/admin/supply-days", days, TestFiles.Json)).EnsureSuccessStatusCode();

        _category = (await (await _admin.PostAsJsonAsync("/api/admin/categories", new { name = "עופות" })).Read<CategoryDto>()).Id;
        _chicken = (await CreateDish(new DishInput(
            "עוף בתנור", _category, null, null, SellBy.Units, ChoiceMode.Fixed, null, null, null, null, false, false,
            [new OptionInput(null, "חצי", 1, 45, false), new OptionInput(null, "שלם", 1, 70, true)], []))).Id;
        _meat = (await CreateDish(new DishInput(
            "בשר טחון", _category, null, null, SellBy.Weight, ChoiceMode.Free, 0.5m, 3m, 0.25m, 90m, false, false, null, []))).Id;
    }

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private static DateOnly Today() =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(DateTime.UtcNow, TimeZoneInfo.FindSystemTimeZoneById("Asia/Jerusalem")));

    private async Task<DishDto> CreateDish(DishInput input) =>
        await (await _admin.PostAsJsonAsync("/api/admin/dishes", input, TestFiles.Json)).Read<DishDto>();

    /// <summary>A list for <see cref="Phone"/> with a general discount.</summary>
    private async Task<PriceListDto> ListWith(DiscountDto discount)
    {
        var list = await _admin.PostAsJsonAsync(Lists, new PriceListInput("קבועים", null, discount), TestFiles.Json).Read<PriceListDto>();
        (await _admin.PutAsJsonAsync($"{Lists}/{list.Id}/phones", new PhonesInput([Phone]), TestFiles.Json)).EnsureSuccessStatusCode();
        return list;
    }

    private Task<HttpResponseMessage> SaveDish(int listId, int dishId, decimal basePrice, decimal price, DateOnly? from = null, DateOnly? to = null) =>
        _admin.PutAsJsonAsync($"{Lists}/{listId}/dishes", new DishesInput([new PriceListDishInput(dishId, basePrice, price, from, to)]), TestFiles.Json);

    private async Task<HttpClient> LoggedIn()
    {
        var response = await _factory.CreateApiClient().PostAsJsonAsync("/api/account/login", new { phone = Phone });
        Assert.True(response.IsSuccessStatusCode);
        var cookie = response.Headers.GetValues("Set-Cookie").Single(c => c.StartsWith(ApiFactory.SiteId + "_user=")).Split(';')[0];
        var client = _factory.CreateApiClient();
        client.DefaultRequestHeaders.Add("Cookie", cookie);
        return client;
    }

    private static async Task<MenuDishDto> MenuDish(HttpClient client, int id) =>
        (await client.GetAsync("/api/menu").Read<MenuDto>()).Dishes.Single(d => d.Id == id);

    private static decimal Whole(MenuDishDto dish) => dish.Options.Single(o => o.IsDefault).Price;

    [Fact]
    public async Task The_general_discount_reaches_every_price_rounded_up_and_the_order()
    {
        var list = await ListWith(new DiscountDto(15, null, null, DiscountRules.Dish));
        Assert.Equal(new DiscountDto(15, null, null, DiscountRules.Dish), list.Discount);
        var client = await LoggedIn();

        var chicken = await MenuDish(client, _chicken);
        Assert.Equal(60, Whole(chicken)); // 59.5 rounded up
        Assert.Equal(39, chicken.Options.Single(o => o.Label == "חצי").Price); // 38.25
        Assert.Equal(70, chicken.PriceBeforeDiscount);
        Assert.Equal(77, (await MenuDish(client, _meat)).UnitPrice); // 76.5

        // A guest keeps the regular prices.
        Assert.Equal(70, Whole(await MenuDish(_factory.CreateApiClient(), _chicken)));

        var menu = await client.GetAsync("/api/menu").Read<MenuDto>();
        var order = await client.PostAsJsonAsync("/api/orders", new
        {
            phone = "0521111111", name = "דנה", city = "חיפה", street = "הרצל", houseNumber = "1",
            supplyDate = menu.SupplyDates[0].Date.ToString("yyyy-MM-dd"), fulfillmentMethod = "Pickup", paymentMethod = "OnDelivery",
            items = new object[] { new { dishId = _chicken, optionId = (int?)null, quantity = 1m, addOns = Array.Empty<object>() } },
        }, TestFiles.Json).Read<ConfirmationDto>();
        Assert.Equal(60, order.Items.Single().UnitPrice);
    }

    [Theory]
    [InlineData(DiscountRules.General, 63)]
    [InlineData(DiscountRules.Dish, 50)]
    [InlineData(DiscountRules.Higher, 50)]
    [InlineData(DiscountRules.Lower, 63)]
    public async Task The_lists_rule_decides_between_a_dishs_own_discount_and_the_general_one(string rule, decimal expected)
    {
        var list = await ListWith(new DiscountDto(10, null, null, rule));
        (await SaveDish(list.Id, _chicken, 70, 50)).EnsureSuccessStatusCode();
        Assert.Equal(expected, Whole(await MenuDish(await LoggedIn(), _chicken)));
    }

    [Fact]
    public async Task Outside_its_dates_the_dish_gets_the_general_discount_and_outside_the_lists_the_dishs_own()
    {
        var list = await ListWith(new DiscountDto(10, null, null, DiscountRules.Dish));
        (await SaveDish(list.Id, _chicken, 70, 50, to: Today().AddDays(-1))).EnsureSuccessStatusCode();
        var client = await LoggedIn();
        Assert.Equal(63, Whole(await MenuDish(client, _chicken)));

        (await SaveDish(list.Id, _chicken, 70, 50)).EnsureSuccessStatusCode();
        await (await _admin.PutAsJsonAsync($"{Lists}/{list.Id}",
            new PriceListInput("קבועים", null, new DiscountDto(10, Today().AddDays(1), null, DiscountRules.General)), TestFiles.Json))
            .Read<PriceListDto>();
        Assert.Equal(50, Whole(await MenuDish(client, _chicken)));
        Assert.Equal(90, (await MenuDish(client, _meat)).UnitPrice);
    }

    [Fact]
    public async Task A_dish_added_after_the_list_was_made_gets_the_general_discount()
    {
        await ListWith(new DiscountDto(10, null, null, DiscountRules.Dish));
        var soup = (await CreateDish(new DishInput(
            "מרק", _category, null, null, SellBy.Units, ChoiceMode.Fixed, null, null, null, null, false, false,
            [new OptionInput(null, "קערה", 1, 33, true)], []))).Id;
        Assert.Equal(30, Whole(await MenuDish(await LoggedIn(), soup))); // 29.7
    }

    [Fact]
    public async Task Leaving_the_discount_out_keeps_it_and_its_fields_are_checked()
    {
        var list = await ListWith(new DiscountDto(10, null, null, DiscountRules.Higher));
        var renamed = await _admin.PutAsJsonAsync($"{Lists}/{list.Id}", new PriceListInput("חדש", null), TestFiles.Json).Read<PriceListDto>();
        Assert.Equal(new DiscountDto(10, null, null, DiscountRules.Higher), renamed.Discount);

        var response = await _admin.PutAsJsonAsync($"{Lists}/{list.Id}",
            new PriceListInput("חדש", null, new DiscountDto(100, Today(), Today().AddDays(-1), "best")), TestFiles.Json);
        await response.AssertInvalid("discount.percent", "invalid");
        await response.AssertInvalid("discount.to", "toBeforeFrom");
        await response.AssertInvalid("discount.rule", "invalid");

        var off = await _admin.PutAsJsonAsync($"{Lists}/{list.Id}",
            new PriceListInput("חדש", null, new DiscountDto(null, null, null, DiscountRules.Dish)), TestFiles.Json).Read<PriceListDto>();
        Assert.Null(off.Discount.Percent);
        Assert.Equal(70, Whole(await MenuDish(await LoggedIn(), _chicken)));
    }
}
