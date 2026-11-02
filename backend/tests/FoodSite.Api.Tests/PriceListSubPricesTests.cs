using System.Net.Http.Json;
using FoodSite.Api.Data.Entities;
using static FoodSite.Api.Controllers.Admin.CategoriesController;
using static FoodSite.Api.Controllers.Admin.DishesController;
using static FoodSite.Api.Controllers.Admin.OrdersAdminController;
using static FoodSite.Api.Controllers.Admin.PriceListsController;
using static FoodSite.Api.Controllers.Admin.SupplyDaysController;
using static FoodSite.Api.Controllers.OrdersController;
using static FoodSite.Api.Controllers.PublicController;

namespace FoodSite.Api.Tests;

/// <summary>A list's other prices (options, add-ons, prices above a limit), the dish's window, and updating linked lists.</summary>
[Collection(PostgresCollection.Name)]
public sealed class PriceListSubPricesTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string Phone = "0501234567";
    private const string Lists = "/api/admin/price-lists";

    private readonly ApiFactory _factory = new(postgres);
    private HttpClient _admin = null!;
    private DishDto _couscous = null!;
    private int _thigh;
    private string _big = "";
    private string _addOn = "";
    private string _addOnOver = "";
    private string _groupOver = "";

    public async Task InitializeAsync()
    {
        _admin = await _factory.CreateAdminClientAsync();
        var days = Enum.GetValues<DayOfWeek>().Select(d =>
            new SupplyDayDto(d, true, (DayOfWeek)(((int)d + 6) % 7), new TimeOnly(0, 0)));
        (await _admin.PutAsJsonAsync("/api/admin/supply-days", days, TestFiles.Json)).EnsureSuccessStatusCode();

        var category = await (await _admin.PostAsJsonAsync("/api/admin/categories", new { name = "קוסקוס" })).Read<CategoryDto>();
        _thigh = (await CreateDish(new DishInput(
            "ירך", category.Id, null, null, SellBy.Units, ChoiceMode.Fixed, null, null, null, null, true, false,
            [new OptionInput(null, "יחידה", 1, 12, true)], []))).Id;
        _couscous = await CreateDish(new DishInput(
            "קוסקוס", category.Id, null, null, SellBy.Units, ChoiceMode.Fixed, null, null, null, null, false, false,
            [new OptionInput(null, "רגיל", 1, 50, true), new OptionInput(null, "גדול", 1, 80, false)], null,
            AddOnGroups: [new AddOnGroupInput(null, "בשרים", 3, 15)],
            AddOns: [new AddOnLinkInput(_thigh, 0, 8, 2, false, OverLimitPrice: 10)]));
        _big = $"o:{_couscous.Options.Single(o => !o.IsDefault).Id}";
        _addOn = $"a:{_thigh}:0";
        _addOnOver = $"ao:{_thigh}:0";
        _groupOver = $"g:{_couscous.AddOnGroups!.Single().Id}";
    }

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private static DateOnly Today() =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(DateTime.UtcNow, TimeZoneInfo.FindSystemTimeZoneById("Asia/Jerusalem")));

    private async Task<DishDto> CreateDish(DishInput input)
    {
        var response = await _admin.PostAsJsonAsync("/api/admin/dishes", input, TestFiles.Json);
        return await response.Read<DishDto>();
    }

    private async Task<PriceListDto> CreateList(string name, int? baseListId = null) =>
        await _admin.PostAsJsonAsync(Lists, new PriceListInput(name, baseListId), TestFiles.Json).Read<PriceListDto>();

    private async Task<PriceListDishDto> Couscous(int listId) =>
        (await _admin.GetAsync($"{Lists}/{listId}/dishes").Read<List<PriceListDishDto>>()).Single(d => d.DishId == _couscous.Id);

    private Task<HttpResponseMessage> Save(int listId, PriceListDishInput row, bool updateLinked = false) =>
        _admin.PutAsJsonAsync($"{Lists}/{listId}/dishes{(updateLinked ? "?updateLinked=true" : "")}", new DishesInput([row]), TestFiles.Json);

    private PriceListDishInput Input(PriceListDishDto row, decimal price, Dictionary<string, decimal>? subs = null,
        DateOnly? from = null, DateOnly? to = null) =>
        new(row.DishId, row.BasePrice, price, from, to,
            row.SubPrices.Select(s => new SubPriceInput(s.Key, s.BasePrice, subs?.GetValueOrDefault(s.Key, s.Price) ?? s.Price)).ToList());

    private async Task<HttpClient> LoggedIn()
    {
        var response = await _factory.CreateApiClient().PostAsJsonAsync("/api/account/login", new { phone = Phone });
        var cookie = response.Headers.GetValues("Set-Cookie").Single(c => c.StartsWith(ApiFactory.SiteId + "_user=")).Split(';')[0];
        var client = _factory.CreateApiClient();
        client.DefaultRequestHeaders.Add("Cookie", cookie);
        return client;
    }

    private async Task<MenuDishDto> MenuCouscous(HttpClient client) =>
        (await client.GetAsync("/api/menu").Read<MenuDto>()).Dishes.Single(d => d.Id == _couscous.Id);

    [Fact]
    public async Task A_list_lists_and_copies_the_dishs_other_prices()
    {
        var vip = await CreateList("קבועים");
        var row = await Couscous(vip.Id);
        Assert.Equal(
            [(_big, "option", "גדול", 80m), (_addOn, "addOn", "ירך", 8m), (_addOnOver, "addOnOverLimit", "ירך", 10m), (_groupOver, "groupOverLimit", "בשרים", 15m)],
            row.SubPrices.Select(s => (s.Key, s.Kind, s.Name, s.Price)));
        Assert.All(row.SubPrices, s => Assert.True(s.InList));

        (await Save(vip.Id, Input(row, 45, new() { [_big] = 70, [_addOn] = 5 }))).EnsureSuccessStatusCode();
        var family = await CreateList("משפחה", vip.Id);
        var copied = await Couscous(family.Id);
        Assert.Equal([70m, 5m, 10m, 15m], copied.SubPrices.Select(s => s.BasePrice));
        Assert.Equal(45m, copied.BasePrice);
    }

    [Fact]
    public async Task A_client_on_the_list_pays_its_other_prices_within_the_rows_dates()
    {
        var vip = await CreateList("קבועים");
        (await _admin.PutAsJsonAsync($"{Lists}/{vip.Id}/phones", new PhonesInput([Phone]), TestFiles.Json)).EnsureSuccessStatusCode();
        var row = await Couscous(vip.Id);
        (await Save(vip.Id, Input(row, 45, new() { [_big] = 70, [_addOn] = 5, [_addOnOver] = 9 }))).EnsureSuccessStatusCode();
        var client = await LoggedIn();

        var dish = await MenuCouscous(client);
        Assert.Equal(70, dish.Options.Single(o => !o.IsDefault).Price);
        Assert.Equal((5m, 9m), (dish.AddOns!.Single().Price!.Value, dish.AddOns!.Single().OverLimitPrice!.Value));
        Assert.Equal(15, dish.AddOnGroups!.Single().OverLimitPrice);
        var guest = await MenuCouscous(_factory.CreateApiClient());
        Assert.Equal((80m, 8m), (guest.Options.Single(o => !o.IsDefault).Price, guest.AddOns!.Single().Price!.Value));

        var menu = await client.GetAsync("/api/menu").Read<MenuDto>();
        var confirmation = await client.PostAsJsonAsync("/api/orders", new
        {
            phone = Phone, name = "דנה", city = "חיפה", street = "הרצל", houseNumber = "1",
            supplyDate = menu.SupplyDates[0].Date.ToString("yyyy-MM-dd"), fulfillmentMethod = "Delivery", paymentMethod = "OnDelivery",
            items = new object[]
            {
                new
                {
                    dishId = _couscous.Id, optionId = _couscous.Options.Single(o => !o.IsDefault).Id, quantity = 1m,
                    addOns = new[] { new { dishId = _thigh, optionId = (int?)null, quantity = 3m } },
                },
            },
        }, TestFiles.Json).Read<ConfirmationDto>();
        Assert.Equal(70 + 2 * 5 + 9, confirmation.Items.Sum(i => i.LineTotal));
        var order = await _admin.GetAsync($"/api/admin/orders/{confirmation.Id}").Read<OrderDto>();
        Assert.All(order.Items, i => Assert.Equal("קבועים", i.PriceListName));

        // Past its dates the row's other prices go with it.
        (await Save(vip.Id, Input(await Couscous(vip.Id), 45, to: Today().AddDays(-1)))).EnsureSuccessStatusCode();
        dish = await MenuCouscous(client);
        Assert.Equal((80m, 8m), (dish.Options.Single(o => !o.IsDefault).Price, dish.AddOns!.Single().Price!.Value));
    }

    [Fact]
    public async Task The_default_list_changes_the_regular_other_prices()
    {
        var lists = await _admin.GetAsync(Lists).Read<List<PriceListDto>>();
        var row = await Couscous(lists.Single().Id);
        (await Save(row: Input(row, 55, new() { [_big] = 85, [_groupOver] = 0 }), listId: lists.Single().Id)).EnsureSuccessStatusCode();

        var dish = await MenuCouscous(_factory.CreateApiClient());
        Assert.Equal([55m, 85m], dish.Options.OrderBy(o => o.Id).Select(o => o.Price));
        Assert.Equal(0, dish.AddOnGroups!.Single().OverLimitPrice);
    }

    [Fact]
    public async Task Other_prices_are_checked()
    {
        var vip = await CreateList("קבועים");
        var row = await Couscous(vip.Id);
        var input = new PriceListDishInput(row.DishId, 50, 45, null, null,
            [new SubPriceInput(_big, 80, -1), new SubPriceInput(_addOn, 8, 0), new SubPriceInput("o:9999", 1, 1), new SubPriceInput(_addOnOver, -1, 5)]);
        var response = await Save(vip.Id, input);
        await response.AssertInvalid("dishes[0].subPrices[0].price", "invalid");
        await response.AssertInvalid("dishes[0].subPrices[2].key", "notFound");
        await response.AssertInvalid("dishes[0].subPrices[3].basePrice", "invalid");
        Assert.DoesNotContain("subPrices[1]", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_list_can_price_an_other_option_at_zero()
    {
        var vip = await CreateList("קבועים");
        var row = await Couscous(vip.Id);
        var input = new PriceListDishInput(row.DishId, 50, 45, null, null, [new SubPriceInput(_big, 0, 0)]);
        (await Save(vip.Id, input)).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task The_dishs_window_has_a_row_per_list_with_the_default_first()
    {
        var vip = await CreateList("קבועים");
        (await Save(vip.Id, Input(await Couscous(vip.Id), 45))).EnsureSuccessStatusCode();
        var rows = await _admin.GetAsync($"{Lists}/dishes/{_couscous.Id}").Read<List<ListDishDto>>();
        Assert.Equal([(true, 50m), (false, 45m)], rows.Select(r => (r.List.IsDefault, r.Dish.Price)));
        Assert.Equal(4, rows[1].Dish.SubPrices.Count);
    }

    [Fact]
    public async Task A_changed_price_can_become_the_base_price_in_the_linked_lists()
    {
        var vip = await CreateList("קבועים");
        var family = await CreateList("משפחה", vip.Id);
        var friends = await CreateList("חברים", vip.Id);
        // Friends have a discount on the couscous, family pays the base price.
        var friendsRow = await Couscous(friends.Id);
        (await Save(friends.Id, Input(friendsRow, 40, new() { [_big] = 60 }))).EnsureSuccessStatusCode();

        (await Save(vip.Id, Input(await Couscous(vip.Id), 45, new() { [_big] = 75 }), updateLinked: true)).EnsureSuccessStatusCode();
        var familyRow = await Couscous(family.Id);
        Assert.Equal((45m, 45m), (familyRow.BasePrice, familyRow.Price));
        Assert.Equal((75m, 75m), (familyRow.SubPrices.Single(s => s.Key == _big).BasePrice, familyRow.SubPrices.Single(s => s.Key == _big).Price));
        friendsRow = await Couscous(friends.Id);
        Assert.Equal((45m, 40m), (friendsRow.BasePrice, friendsRow.Price));
        Assert.Equal((75m, 60m), (friendsRow.SubPrices.Single(s => s.Key == _big).BasePrice, friendsRow.SubPrices.Single(s => s.Key == _big).Price));

        // Without asking for it, the linked lists keep their prices.
        (await Save(vip.Id, Input(await Couscous(vip.Id), 42))).EnsureSuccessStatusCode();
        Assert.Equal(45m, (await Couscous(family.Id)).BasePrice);
    }

    [Fact]
    public async Task A_change_in_the_default_list_can_update_the_lists_based_on_it()
    {
        var defaultList = (await _admin.GetAsync(Lists).Read<List<PriceListDto>>()).Single();
        var vip = await CreateList("קבועים");
        var family = await CreateList("משפחה", vip.Id);
        (await Save(defaultList.Id, Input(await Couscous(defaultList.Id), 52), updateLinked: true)).EnsureSuccessStatusCode();
        Assert.Equal((52m, 52m), ((await Couscous(vip.Id)).BasePrice, (await Couscous(vip.Id)).Price));
        // Only the lists based on the default list itself.
        Assert.Equal(50m, (await Couscous(family.Id)).BasePrice);
    }
}
