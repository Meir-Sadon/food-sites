using System.Net;
using System.Net.Http.Json;
using static FoodSite.Api.Controllers.Admin.CategoriesController;
using static FoodSite.Api.Controllers.Admin.DishesController;
using static FoodSite.Api.Controllers.Admin.OrdersAdminController;
using static FoodSite.Api.Controllers.Admin.PriceListsController;
using static FoodSite.Api.Controllers.Admin.SupplyDaysController;
using static FoodSite.Api.Controllers.OrdersController;
using static FoodSite.Api.Controllers.PublicController;
using FoodSite.Api.Data.Entities;

namespace FoodSite.Api.Tests;

[Collection(PostgresCollection.Name)]
public sealed class PriceListsTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string Phone = "0501234567";
    private const string Lists = "/api/admin/price-lists";

    private readonly ApiFactory _factory = new(postgres);
    private HttpClient _admin = null!;
    private int _chicken;
    private int _meat;

    public async Task InitializeAsync()
    {
        _admin = await _factory.CreateAdminClientAsync();
        var days = Enum.GetValues<DayOfWeek>().Select(d =>
            new SupplyDayDto(d, true, (DayOfWeek)(((int)d + 6) % 7), new TimeOnly(0, 0)));
        (await _admin.PutAsJsonAsync("/api/admin/supply-days", days, TestFiles.Json)).EnsureSuccessStatusCode();

        var category = await (await _admin.PostAsJsonAsync("/api/admin/categories", new { name = "עופות" })).Read<CategoryDto>();
        _chicken = (await CreateDish(new DishInput(
            "עוף בתנור", category.Id, null, null, SellBy.Units, ChoiceMode.Fixed, null, null, null, null, false, false,
            [new OptionInput(null, "חצי", 1, 40, false), new OptionInput(null, "שלם", 1, 70, true)], []))).Id;
        _meat = (await CreateDish(new DishInput(
            "בשר טחון", category.Id, null, null, SellBy.Weight, ChoiceMode.Free, 0.5m, 3m, 0.25m, 90m, false, false, null, []))).Id;
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

    private Task<HttpResponseMessage> CreateList(string name, int? baseListId = null) =>
        _admin.PostAsJsonAsync(Lists, new PriceListInput(name, baseListId), TestFiles.Json);

    private async Task<PriceListDto> DefaultList() => (await _admin.GetAsync(Lists).Read<List<PriceListDto>>()).Single(l => l.IsDefault);

    private async Task<List<PriceListDishDto>> Dishes(int listId) => await _admin.GetAsync($"{Lists}/{listId}/dishes").Read<List<PriceListDishDto>>();

    private Task<HttpResponseMessage> SaveDishes(int listId, params PriceListDishInput[] dishes) =>
        _admin.PutAsJsonAsync($"{Lists}/{listId}/dishes", new DishesInput([.. dishes]), TestFiles.Json);

    private Task<HttpResponseMessage> SavePhones(int listId, params string[] phones) =>
        _admin.PutAsJsonAsync($"{Lists}/{listId}/phones", new PhonesInput([.. phones]), TestFiles.Json);

    /// <summary>A list for <see cref="Phone"/> (given in its international form) with the chicken at <paramref name="price"/>.</summary>
    private async Task<PriceListDto> ListForPhone(string name, decimal price, DateOnly? from = null, DateOnly? to = null)
    {
        var list = await CreateList(name).Read<PriceListDto>();
        (await SavePhones(list.Id, "+972-50-123-4567")).EnsureSuccessStatusCode();
        (await SaveDishes(list.Id, new PriceListDishInput(_chicken, 70, price, from, to))).EnsureSuccessStatusCode();
        return list;
    }

    private async Task<HttpClient> LoggedIn(ApiFactory? factory = null)
    {
        factory ??= _factory;
        var response = await factory.CreateApiClient().PostAsJsonAsync("/api/account/login", new { phone = Phone });
        Assert.True(response.IsSuccessStatusCode);
        var cookie = response.Headers.GetValues("Set-Cookie").Single(c => c.StartsWith(ApiFactory.SiteId + "_user=")).Split(';')[0];
        var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Add("Cookie", cookie);
        return client;
    }

    private static async Task<MenuDishDto> MenuDish(HttpClient client, int id) =>
        (await client.GetAsync("/api/menu").Read<MenuDto>()).Dishes.Single(d => d.Id == id);

    private static decimal DefaultPrice(MenuDishDto dish) => dish.Options.Single(o => o.IsDefault).Price;

    private static async Task<ConfirmationDto> Order(HttpClient client)
    {
        var menu = await client.GetAsync("/api/menu").Read<MenuDto>();
        var chicken = menu.Dishes.Single(d => d.Name == "עוף בתנור");
        var meat = menu.Dishes.Single(d => d.Name == "בשר טחון");
        return await client.PostAsJsonAsync("/api/orders", new
        {
            phone = "0521111111",
            name = "דנה",
            city = "חיפה",
            street = "הרצל",
            houseNumber = "1",
            supplyDate = menu.SupplyDates[0].Date.ToString("yyyy-MM-dd"),
            fulfillmentMethod = "Delivery",
            paymentMethod = "OnDelivery",
            notes = (string?)null,
            items = new object[]
            {
                new { dishId = chicken.Id, optionId = (int?)null, quantity = 2m, addOns = Array.Empty<object>() },
                new { dishId = meat.Id, optionId = (int?)null, quantity = 1m, addOns = Array.Empty<object>() },
            },
        }, TestFiles.Json).Read<ConfirmationDto>();
    }

    // ---------- Lists ----------

    [Fact]
    public async Task The_default_list_is_made_once_and_cannot_be_renamed_or_removed()
    {
        var lists = await _admin.GetAsync(Lists).Read<List<PriceListDto>>();
        var only = Assert.Single(lists);
        Assert.True(only.IsDefault);
        Assert.Null(only.Name);
        Assert.Single(await _admin.GetAsync(Lists).Read<List<PriceListDto>>());

        await (await _admin.PutAsJsonAsync($"{Lists}/{only.Id}", new PriceListInput("שם", null), TestFiles.Json))
            .AssertInvalid("Name", "isDefault");
        var removed = await _admin.DeleteAsync($"{Lists}/{only.Id}");
        Assert.Equal(HttpStatusCode.Conflict, removed.StatusCode);
        Assert.Contains("isDefault", await removed.Content.ReadAsStringAsync());
        await (await SavePhones(only.Id, Phone)).AssertInvalid("Phones", "isDefault");
    }

    [Fact]
    public async Task A_new_list_copies_its_bases_prices_and_keeps_them_when_the_base_changes_later()
    {
        var vip = await CreateList(" לקוחות קבועים ").Read<PriceListDto>();
        Assert.Equal("לקוחות קבועים", vip.Name);
        Assert.Null(vip.BaseListId);
        var copied = await Dishes(vip.Id);
        Assert.Equal([(70m, 70m, true), (90m, 90m, true)], copied.Select(d => (d.BasePrice, d.Price, d.InList)));

        (await SaveDishes(vip.Id, new PriceListDishInput(_chicken, 70, 60, null, null))).EnsureSuccessStatusCode();
        var family = await CreateList("משפחה", vip.Id).Read<PriceListDto>();
        Assert.Equal(vip.Id, family.BaseListId);
        Assert.Equal([60m, 90m], (await Dishes(family.Id)).Select(d => d.BasePrice));

        // Prices don't follow the base: a later change in the base list leaves the copy as it was.
        (await SaveDishes(vip.Id, new PriceListDishInput(_chicken, 70, 50, null, null))).EnsureSuccessStatusCode();
        Assert.Equal(60m, (await Dishes(family.Id)).Single(d => d.DishId == _chicken).Price);

        // Back to the default list as base: the regular prices come back.
        (await _admin.PutAsJsonAsync($"{Lists}/{family.Id}", new PriceListInput("משפחה", (await DefaultList()).Id), TestFiles.Json))
            .EnsureSuccessStatusCode();
        Assert.Equal([70m, 90m], (await Dishes(family.Id)).Select(d => d.Price));
    }

    [Fact]
    public async Task Names_are_required_and_unique_and_a_base_is_one_level_deep()
    {
        await (await CreateList(" ")).AssertInvalid("Name", "required");
        var vip = await CreateList("קבועים").Read<PriceListDto>();
        await (await CreateList("קבועים")).AssertInvalid("Name", "duplicate");
        await (await CreateList("אחר", 9999)).AssertInvalid("BaseListId", "notFound");

        var family = await CreateList("משפחה", vip.Id).Read<PriceListDto>();
        await (await CreateList("נכדים", family.Id)).AssertInvalid("BaseListId", "baseTooDeep");
        // A list that others are based on cannot get a base of its own.
        var other = await CreateList("אחר").Read<PriceListDto>();
        await (await _admin.PutAsJsonAsync($"{Lists}/{vip.Id}", new PriceListInput("קבועים", other.Id), TestFiles.Json))
            .AssertInvalid("BaseListId", "baseTooDeep");

        var removed = await _admin.DeleteAsync($"{Lists}/{vip.Id}");
        Assert.Equal(HttpStatusCode.Conflict, removed.StatusCode);
        Assert.Contains("isBase", await removed.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.NoContent, (await _admin.DeleteAsync($"{Lists}/{family.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await _admin.DeleteAsync($"{Lists}/{vip.Id}")).StatusCode);
    }

    [Fact]
    public async Task Prices_and_dates_are_checked()
    {
        var vip = await CreateList("קבועים").Read<PriceListDto>();
        var response = await SaveDishes(vip.Id,
            new PriceListDishInput(_chicken, -1, 60, null, null),
            new PriceListDishInput(_meat, 90, 80, Today(), Today().AddDays(-1)),
            new PriceListDishInput(9999, 10, 10, null, null));
        await response.AssertInvalid("dishes[0].basePrice", "positive");
        await response.AssertInvalid("dishes[1].to", "toBeforeFrom");
        await response.AssertInvalid("dishes[2].dishId", "notFound");
    }

    [Fact]
    public async Task A_list_can_price_a_dish_at_zero()
    {
        var vip = await CreateList("קבועים").Read<PriceListDto>();
        (await SavePhones(vip.Id, Phone)).EnsureSuccessStatusCode();
        (await SaveDishes(vip.Id, new PriceListDishInput(_chicken, 0, 0, null, null))).EnsureSuccessStatusCode();
        var row = (await Dishes(vip.Id)).Single(d => d.DishId == _chicken);
        Assert.Equal((0m, 0m), (row.BasePrice, row.Price));

        var client = await LoggedIn();
        Assert.Equal(0, DefaultPrice(await MenuDish(client, _chicken)));
        var order = await Order(client);
        Assert.Equal(0, order.Items.Single(i => i.DishName == "עוף בתנור").UnitPrice);
    }

    [Fact]
    public async Task The_default_list_refuses_a_zero_that_would_make_a_dish_free()
    {
        var list = await DefaultList();
        await (await SaveDishes(list.Id, new PriceListDishInput(_chicken, 0, 0, null, null))).AssertInvalid("dishes[0].price", "positive");
    }

    [Fact]
    public async Task Editing_the_default_list_changes_the_regular_prices()
    {
        var list = await DefaultList();
        (await SaveDishes(list.Id,
            new PriceListDishInput(_chicken, 0, 75, null, null),
            new PriceListDishInput(_meat, 0, 95, null, null))).EnsureSuccessStatusCode();

        var guest = _factory.CreateApiClient();
        Assert.Equal(75, DefaultPrice(await MenuDish(guest, _chicken)));
        Assert.Equal(40, (await MenuDish(guest, _chicken)).Options.Single(o => !o.IsDefault).Price);
        Assert.Equal(95, (await MenuDish(guest, _meat)).UnitPrice);
    }

    [Fact]
    public async Task Phones_are_kept_once_in_their_local_form()
    {
        var vip = await CreateList("קבועים").Read<PriceListDto>();
        var saved = await SavePhones(vip.Id, "+972501234567", "050-123-4567", "0527654321").Read<PriceListDto>();
        Assert.Equal(["0501234567", "0527654321"], saved.Phones);
        await (await SavePhones(vip.Id, "12")).AssertInvalid("phones[0]", "phone");
        Assert.Equal(["0527654321"], (await SavePhones(vip.Id, "0527654321").Read<PriceListDto>()).Phones);
    }

    // ---------- Prices for clients ----------

    [Fact]
    public async Task A_logged_in_client_on_a_list_sees_and_pays_its_prices_and_a_guest_does_not()
    {
        await ListForPhone("קבועים", 60);
        var client = await LoggedIn();

        var dish = await MenuDish(client, _chicken);
        Assert.Equal(60, DefaultPrice(dish));
        Assert.Equal(70, dish.PriceBeforeDiscount);
        Assert.Equal(40, dish.Options.Single(o => !o.IsDefault).Price);
        var guest = _factory.CreateApiClient();
        Assert.Equal(70, DefaultPrice(await MenuDish(guest, _chicken)));
        Assert.Null((await MenuDish(guest, _chicken)).PriceBeforeDiscount);

        var confirmation = await Order(client);
        Assert.Equal(2 * 60 + 90, confirmation.Items.Sum(i => i.LineTotal));
        var order = await _admin.GetAsync($"/api/admin/orders/{confirmation.Id}").Read<OrderDto>();
        Assert.Equal("קבועים", order.Items.Single(i => i.DishName == "עוף בתנור").PriceListName);
        // The list holds every dish, at its regular price where the admin didn't change it.
        Assert.Equal("קבועים", order.Items.Single(i => i.DishName == "בשר טחון").PriceListName);

        // A guest's order, even with the same phone typed in, is priced regularly.
        var guestOrder = await Order(guest);
        Assert.Equal(2 * 70 + 90, guestOrder.Items.Sum(i => i.LineTotal));
    }

    [Fact]
    public async Task The_lowest_price_wins_between_lists_and_dates_bound_a_price()
    {
        await ListForPhone("קבועים", 60);
        await ListForPhone("מבצע", 55, from: Today().AddDays(2));
        var client = await LoggedIn();
        Assert.Equal(60, DefaultPrice(await MenuDish(client, _chicken)));

        await ListForPhone("השבוע", 50, from: Today(), to: Today());
        Assert.Equal(50, DefaultPrice(await MenuDish(client, _chicken)));
        await ListForPhone("נגמר", 30, to: Today().AddDays(-2));
        Assert.Equal(50, DefaultPrice(await MenuDish(client, _chicken)));
    }

    [Fact]
    public async Task A_list_price_raised_above_the_regular_one_strikes_nothing()
    {
        var list = await CreateList("יקר").Read<PriceListDto>();
        (await SavePhones(list.Id, Phone)).EnsureSuccessStatusCode();
        (await SaveDishes(list.Id, new PriceListDishInput(_chicken, 80, 80, null, null))).EnsureSuccessStatusCode();
        var dish = await MenuDish(await LoggedIn(), _chicken);
        Assert.Equal(80, DefaultPrice(dish));
        Assert.Null(dish.PriceBeforeDiscount);
    }

    [Fact]
    public async Task With_the_feature_off_the_tab_is_gone_and_every_price_is_regular()
    {
        await ListForPhone("קבועים", 60);
        await using var off = new ApiFactory(postgres, new() { ["Site:Features:priceLists"] = "false" });
        var admin = await off.CreateAdminClientAsync();
        var response = await admin.GetAsync(Lists);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Contains("featureDisabled", await response.Content.ReadAsStringAsync());

        // The other factory has its own database: copy the list there directly.
        using (var db = off.CreateDbContext())
        {
            var category = new Category { Name = "עופות" };
            var dish = new Dish
            {
                Name = "עוף בתנור", Category = category, SellBy = SellBy.Units, ChoiceMode = ChoiceMode.Fixed,
                Options = [new DishOption { Label = "שלם", Amount = 1, Price = 70, IsDefault = true }],
            };
            db.PriceLists.Add(new PriceList
            {
                Name = "קבועים",
                Phones = [new PriceListPhone { Phone = Phone }],
                Dishes = [new PriceListDish { Dish = dish, BasePrice = 70, Price = 60 }],
            });
            await db.SaveChangesAsync();
        }
        var menuDish = (await (await LoggedIn(off)).GetAsync("/api/menu").Read<MenuDto>()).Dishes.Single();
        Assert.Equal(70, DefaultPrice(menuDish));
        Assert.Null(menuDish.PriceBeforeDiscount);
    }
}
