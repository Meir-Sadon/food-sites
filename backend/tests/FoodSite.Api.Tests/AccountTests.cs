using System.Net;
using System.Net.Http.Json;
using FoodSite.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using static FoodSite.Api.Controllers.AccountController;
using static FoodSite.Api.Controllers.Admin.CategoriesController;
using static FoodSite.Api.Controllers.Admin.DishesController;
using static FoodSite.Api.Controllers.Admin.SupplyDaysController;
using static FoodSite.Api.Controllers.OrdersController;
using static FoodSite.Api.Controllers.PublicController;

namespace FoodSite.Api.Tests;

[Collection(PostgresCollection.Name)]
public sealed class AccountTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string Phone = "0501234567";
    private const string OtherPhone = "0527654321";

    private readonly ApiFactory _factory = new(postgres);
    private HttpClient _admin = null!;
    private HttpClient _guest = null!;
    private int _chicken;
    private int _thigh;

    public async Task InitializeAsync()
    {
        _admin = await _factory.CreateAdminClientAsync();
        _guest = _factory.CreateApiClient();

        var days = Enum.GetValues<DayOfWeek>().Select(d =>
            new SupplyDayDto(d, true, (DayOfWeek)(((int)d + 6) % 7), new TimeOnly(0, 0)));
        (await _admin.PutAsJsonAsync("/api/admin/supply-days", days, TestFiles.Json)).EnsureSuccessStatusCode();

        var category = await (await _admin.PostAsJsonAsync("/api/admin/categories", new { name = "עופות" })).Read<CategoryDto>();
        _chicken = (await CreateDish(new DishInput(
            "עוף בתנור", category.Id, null, null, SellBy.Units, ChoiceMode.Fixed, null, null, null, null, false, false,
            [new OptionInput(null, "חצי", 1, 40, false), new OptionInput(null, "שלם", 1, 70, true)], []))).Id;
        _thigh = (await CreateDish(new DishInput(
            "ירך", category.Id, null, null, SellBy.Units, ChoiceMode.Fixed, null, null, null, null, true, false,
            [new OptionInput(null, "יחידה", 1, 12, true)], [_chicken]))).Id;
    }

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private async Task<DishDto> CreateDish(DishInput input) =>
        await (await _admin.PostAsJsonAsync("/api/admin/dishes", input, TestFiles.Json)).Read<DishDto>();

    private static object Profile(string phone, Action<Dictionary<string, object?>>? change = null)
    {
        var input = new Dictionary<string, object?>
        {
            ["phone"] = phone,
            ["fullName"] = " דנה כהן ",
            ["city"] = "חיפה",
            ["street"] = "הרצל",
            ["houseNumber"] = "1",
            ["apartment"] = "4",
            ["email"] = "dana@example.com",
            ["birthday"] = "1990-05-17",
            ["ethnicBackground"] = "מרוקאי",
        };
        change?.Invoke(input);
        return input;
    }

    /// <summary>A client that carries the session cookie from a login or registration response.</summary>
    private HttpClient WithSession(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, Describe(response));
        var cookie = response.Headers.GetValues("Set-Cookie").Single(c => c.StartsWith(ApiFactory.SiteId + "_user=")).Split(';')[0];
        var client = _factory.CreateApiClient();
        client.DefaultRequestHeaders.Add("Cookie", cookie);
        return client;
    }

    private static string Describe(HttpResponseMessage response) =>
        $"{(int)response.StatusCode}: {response.Content.ReadAsStringAsync().GetAwaiter().GetResult()}";

    private async Task<HttpClient> RegisterAsync(string phone = Phone)
    {
        return WithSession(await _guest.PostAsJsonAsync("/api/account/register", Profile(phone), TestFiles.Json));
    }

    private async Task<ConfirmationDto> OrderAsync(HttpClient client, string phone = Phone)
    {
        var menu = await (await _guest.GetAsync("/api/menu")).Read<MenuDto>();
        var order = new
        {
            phone,
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
                new { dishId = _chicken, optionId = (int?)null, quantity = 2m, addOns = new[] { new { dishId = _thigh, optionId = (int?)null, quantity = 3m } } },
            },
        };
        return await (await client.PostAsJsonAsync("/api/orders", order, TestFiles.Json)).Read<ConfirmationDto>();
    }

    // ---------- Registration and login ----------

    [Fact]
    public async Task Registering_creates_the_account_and_starts_a_session()
    {
        var client = await RegisterAsync();

        var me = await (await client.GetAsync("/api/account/me")).Read<ProfileDto>();
        Assert.Equal(Phone, me.Phone);
        Assert.Equal("דנה כהן", me.FullName);
        Assert.Equal("dana@example.com", me.Email);
        Assert.Equal(new DateOnly(1990, 5, 17), me.Birthday);
        Assert.Equal("מרוקאי", me.EthnicBackground);
    }

    [Fact]
    public async Task Registering_needs_only_the_phone_and_checks_what_is_sent()
    {
        var badEmail = await _guest.PostAsJsonAsync(
            "/api/account/register", Profile(Phone, i => i["email"] = "not-an-email"), TestFiles.Json);
        await badEmail.AssertInvalid("email", "email");

        var future = await _guest.PostAsJsonAsync(
            "/api/account/register", Profile(Phone, i => i["birthday"] = "2999-01-01"), TestFiles.Json);
        await future.AssertInvalid("birthday", "invalid");

        // An address that was started has to be whole.
        var partial = await _guest.PostAsJsonAsync(
            "/api/account/register", Profile(Phone, i => i["street"] = null), TestFiles.Json);
        await partial.AssertInvalid("street", "required");

        var phoneOnly = await _guest.PostAsJsonAsync("/api/account/register", new { phone = Phone }, TestFiles.Json);
        Assert.True(phoneOnly.IsSuccessStatusCode);
        var me = await (await WithSession(phoneOnly).GetAsync("/api/account/me")).Read<ProfileDto>();
        Assert.Equal("", me.FullName);
        Assert.Empty(me.Addresses);
    }

    [Fact]
    public async Task A_phone_can_register_only_once()
    {
        await RegisterAsync();

        var again = await _guest.PostAsJsonAsync("/api/account/register", Profile(Phone), TestFiles.Json);

        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
    }

    [Fact]
    public async Task Login_with_a_registered_phone_starts_a_session()
    {
        await RegisterAsync();

        var client = WithSession(await _guest.PostAsJsonAsync("/api/account/login", new { phone = Phone }));

        Assert.Equal("דנה כהן", (await (await client.GetAsync("/api/account/me")).Read<ProfileDto>()).FullName);
    }

    [Fact]
    public async Task Login_of_a_new_phone_makes_the_account_with_nothing_else()
    {
        var response = await _guest.PostAsJsonAsync("/api/account/login", new { phone = OtherPhone });

        response.EnsureSuccessStatusCode();
        var login = await response.Read<LoginDto>();
        Assert.True(login.IsNew);
        Assert.Equal(OtherPhone, login.Profile.Phone);
        Assert.Equal("", login.Profile.FullName);
        Assert.Empty(login.Profile.Addresses);

        var client = WithSession(response);
        Assert.Equal(OtherPhone, (await (await client.GetAsync("/api/account/me")).Read<ProfileDto>()).Phone);

        var again = await (await _guest.PostAsJsonAsync("/api/account/login", new { phone = OtherPhone })).Read<LoginDto>();
        Assert.False(again.IsNew);
        Assert.Equal(login.Profile.Id, again.Profile.Id);
    }

    [Fact]
    public async Task Login_with_a_bad_phone_is_invalid()
    {
        var response = await _guest.PostAsJsonAsync("/api/account/login", new { phone = "12" });

        await response.AssertInvalid("phone", "phone");
    }

    // ---------- Addresses ----------

    private static object Address(string street, string? label = null, bool makeDefault = false) =>
        new { label, city = "חיפה", street, houseNumber = "3", apartment = "", makeDefault };

    [Fact]
    public async Task The_first_address_is_the_default_and_mirrors_into_the_profile()
    {
        var client = WithSession(await _guest.PostAsJsonAsync("/api/account/login", new { phone = Phone }));

        var profile = await (await client.PostAsJsonAsync("/api/account/addresses", Address("הרצל", "בית"))).Read<ProfileDto>();

        var home = Assert.Single(profile.Addresses);
        Assert.True(home.IsDefault);
        Assert.Equal("בית", home.Label);
        Assert.Equal("הרצל 3, חיפה", profile.Address);
        Assert.Equal("הרצל", profile.Street);
    }

    [Fact]
    public async Task Several_addresses_one_default_that_can_change_and_be_deleted()
    {
        var client = WithSession(await _guest.PostAsJsonAsync("/api/account/login", new { phone = Phone }));
        await client.PostAsJsonAsync("/api/account/addresses", Address("הרצל", "בית"));
        var two = await (await client.PostAsJsonAsync("/api/account/addresses", Address("ויצמן", "עבודה"))).Read<ProfileDto>();
        Assert.Equal(["הרצל", "ויצמן"], two.Addresses.Select(a => a.Street));
        Assert.Equal([true, false], two.Addresses.Select(a => a.IsDefault));

        var work = two.Addresses[1];
        var switched = await (await client.PutAsync($"/api/account/addresses/{work.Id}/default", null)).Read<ProfileDto>();
        Assert.Equal("ויצמן", switched.Addresses[0].Street);
        Assert.Equal("ויצמן", switched.Street);
        Assert.Single(switched.Addresses, a => a.IsDefault);

        var edited = await (await client.PutAsJsonAsync($"/api/account/addresses/{work.Id}", Address("ויצמן", "משרד"))).Read<ProfileDto>();
        Assert.Equal("משרד", edited.Addresses[0].Label);

        // Deleting the default hands the role to the one left.
        var left = await (await client.DeleteAsync($"/api/account/addresses/{work.Id}")).Read<ProfileDto>();
        var remaining = Assert.Single(left.Addresses);
        Assert.True(remaining.IsDefault);
        Assert.Equal("הרצל", left.Street);

        var none = await (await client.DeleteAsync($"/api/account/addresses/{remaining.Id}")).Read<ProfileDto>();
        Assert.Empty(none.Addresses);
        Assert.Equal("", none.Address);
    }

    [Fact]
    public async Task An_address_needs_its_parts_is_not_repeated_and_belongs_to_its_owner()
    {
        var client = WithSession(await _guest.PostAsJsonAsync("/api/account/login", new { phone = Phone }));
        var bad = await client.PostAsJsonAsync("/api/account/addresses", new { city = "חיפה", street = "", houseNumber = "1" });
        await bad.AssertInvalid("street", "required");

        var first = await (await client.PostAsJsonAsync("/api/account/addresses", Address("הרצל"))).Read<ProfileDto>();
        var repeat = await client.PostAsJsonAsync("/api/account/addresses", Address("הרצל"));
        await repeat.AssertInvalid("street", "duplicate");

        var other = WithSession(await _guest.PostAsJsonAsync("/api/account/login", new { phone = OtherPhone }));
        Assert.Equal(HttpStatusCode.NotFound, (await other.DeleteAsync($"/api/account/addresses/{first.Addresses[0].Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _guest.GetAsync("/api/account/addresses")).StatusCode);
    }

    // ---------- Keeping details after an order ----------

    private static object Remember(int orderId, string phone = Phone) =>
        new { orderId, phone, name = "דנה כהן", city = "חיפה", street = "הרצל", houseNumber = "7", apartment = "2" };

    private async Task<int> PlaceOrderAsync(HttpClient client, string phone = Phone) => (await OrderAsync(client, phone)).Id;

    [Fact]
    public async Task A_logged_in_client_keeps_name_and_address_after_an_order()
    {
        var client = WithSession(await _guest.PostAsJsonAsync("/api/account/login", new { phone = Phone }));
        var orderId = await PlaceOrderAsync(client);

        var saved = await (await client.PostAsJsonAsync("/api/account/remember", Remember(orderId))).Read<RememberDto>();

        Assert.True(saved.Saved);
        Assert.Equal("דנה כהן", saved.Profile!.FullName);
        var address = Assert.Single(saved.Profile.Addresses);
        Assert.Equal("הרצל 7, דירה 2, חיפה", address.Address);
        Assert.True(address.IsDefault);

        // Asking again with the same address adds nothing.
        var again = await (await client.PostAsJsonAsync("/api/account/remember", Remember(orderId))).Read<RememberDto>();
        Assert.Single(again.Profile!.Addresses);
    }

    [Fact]
    public async Task A_guest_is_remembered_by_phone_and_the_account_made_later_starts_from_it()
    {
        var orderId = await PlaceOrderAsync(_guest);

        var saved = await (await _guest.PostAsJsonAsync("/api/account/remember", Remember(orderId))).Read<RememberDto>();
        Assert.True(saved.Saved);
        Assert.Null(saved.Profile);

        var login = await (await _guest.PostAsJsonAsync("/api/account/login", new { phone = Phone })).Read<LoginDto>();
        Assert.True(login.IsNew);
        Assert.Equal("דנה כהן", login.Profile.FullName);
        var address = Assert.Single(login.Profile.Addresses);
        Assert.Equal("הרצל 7, דירה 2, חיפה", address.Address);
        Assert.True(address.IsDefault);
        await using var db = _factory.CreateDbContext();
        Assert.Equal(0, await db.GuestDetails.CountAsync());
    }

    [Fact]
    public async Task Remember_needs_a_recent_order_of_the_same_phone_and_does_not_write_to_someone_elses_account()
    {
        var orderId = await PlaceOrderAsync(_guest);

        Assert.Equal(HttpStatusCode.NotFound,
            (await _guest.PostAsJsonAsync("/api/account/remember", Remember(orderId, OtherPhone))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await _guest.PostAsJsonAsync("/api/account/remember", Remember(orderId + 100))).StatusCode);

        // The phone has an account, but this caller is not logged in as it: nothing is kept.
        await _guest.PostAsJsonAsync("/api/account/login", new { phone = Phone });
        var anonymous = _factory.CreateApiClient();
        var result = await (await anonymous.PostAsJsonAsync("/api/account/remember", Remember(orderId))).Read<RememberDto>();
        Assert.False(result.Saved);
    }

    [Fact]
    public async Task Account_endpoints_need_a_client_session_and_an_admin_session_is_not_one()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await _guest.GetAsync("/api/account/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _guest.GetAsync("/api/account/orders")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _guest.GetAsync("/api/account/favorites")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _guest.PostAsJsonAsync("/api/account/recommendations", new { text = "x" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _admin.GetAsync("/api/account/me")).StatusCode);
    }

    [Fact]
    public async Task A_client_session_is_not_an_admin_session()
    {
        var client = await RegisterAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/admin/me")).StatusCode);
    }

    // ---------- Profile ----------

    [Fact]
    public async Task The_profile_can_be_edited()
    {
        var client = await RegisterAsync();

        var saved = await (await client.PutAsJsonAsync(
            "/api/account/me",
            Profile(Phone, i => { i["fullName"] = "דנה לוי"; i["email"] = null; }),
            TestFiles.Json)).Read<ProfileDto>();

        Assert.Equal("דנה לוי", saved.FullName);
        Assert.Null(saved.Email);
        Assert.Equal("דנה לוי", (await (await client.GetAsync("/api/account/me")).Read<ProfileDto>()).FullName);
    }

    [Fact]
    public async Task The_phone_can_be_changed()
    {
        var client = await RegisterAsync();

        var saved = await (await client.PutAsJsonAsync("/api/account/me", Profile(OtherPhone), TestFiles.Json)).Read<ProfileDto>();
        Assert.Equal(OtherPhone, saved.Phone);
    }

    [Fact]
    public async Task The_phone_cannot_be_changed_to_one_that_has_an_account()
    {
        await RegisterAsync(OtherPhone);
        var client = await RegisterAsync();

        var response = await client.PutAsJsonAsync("/api/account/me", Profile(OtherPhone), TestFiles.Json);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    // ---------- Orders, history and favorites ----------

    [Fact]
    public async Task A_logged_in_client_orders_and_sees_it_in_the_history()
    {
        var client = await RegisterAsync();

        var confirmation = await OrderAsync(client);

        await using var db = _factory.CreateDbContext();
        var order = await db.Orders.SingleAsync(o => o.Id == confirmation.Id);
        Assert.NotNull(order.UserId);

        var history = await (await client.GetAsync("/api/account/orders")).Read<List<HistoryOrderDto>>();
        var entry = Assert.Single(history);
        Assert.Equal(confirmation.Id, entry.Id);
        Assert.Equal(OrderStatus.New, entry.Status);
        Assert.Equal(2, entry.Items.Count); // the chicken and its thigh add-on
        var parent = entry.Items.Single(i => i.ParentItemId is null);
        Assert.Equal("עוף בתנור", parent.DishName);
        Assert.Equal(parent.Id, entry.Items.Single(i => i.DishId == _thigh).ParentItemId);
    }

    [Fact]
    public async Task Guest_orders_with_a_registered_phone_join_the_history()
    {
        var client = await RegisterAsync();

        var confirmation = await OrderAsync(_guest, Phone);

        var history = await (await client.GetAsync("/api/account/orders")).Read<List<HistoryOrderDto>>();
        Assert.Contains(history, h => h.Id == confirmation.Id);
    }

    [Fact]
    public async Task Registering_adopts_earlier_guest_orders_of_the_same_phone()
    {
        var confirmation = await OrderAsync(_guest, Phone);

        var client = await RegisterAsync();

        var history = await (await client.GetAsync("/api/account/orders")).Read<List<HistoryOrderDto>>();
        Assert.Contains(history, h => h.Id == confirmation.Id);
    }

    [Fact]
    public async Task The_history_shows_only_the_clients_own_orders()
    {
        var mine = await RegisterAsync();
        var theirs = await RegisterAsync(OtherPhone);
        await OrderAsync(theirs, OtherPhone);

        Assert.Empty(await (await mine.GetAsync("/api/account/orders")).Read<List<HistoryOrderDto>>());
    }

    [Fact]
    public async Task A_past_order_can_be_saved_as_a_favorite_and_removed()
    {
        var client = await RegisterAsync();
        var order = await OrderAsync(client);

        var favorite = await (await client.PostAsJsonAsync(
            "/api/account/favorites", new { name = " שישי " , orderId = order.Id }, TestFiles.Json)).Read<FavoriteDto>();

        Assert.Equal("שישי", favorite.Name);
        var item = Assert.Single(favorite.Items);
        Assert.Equal(_chicken, item.DishId);
        Assert.Equal(2m, item.Quantity);
        var whole = await OptionIdOf("שלם");
        Assert.Equal(whole, item.OptionId);
        var addOn = Assert.Single(item.AddOns);
        Assert.Equal(_thigh, addOn.DishId);
        Assert.Equal(3m, addOn.Quantity);

        var listed = await (await client.GetAsync("/api/account/favorites")).Read<List<FavoriteDto>>();
        Assert.Equal(favorite.Id, Assert.Single(listed).Id);

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/account/favorites/{favorite.Id}")).StatusCode);
        Assert.Empty(await (await client.GetAsync("/api/account/favorites")).Read<List<FavoriteDto>>());
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync($"/api/account/favorites/{favorite.Id}")).StatusCode);
    }

    private async Task<int> OptionIdOf(string label)
    {
        await using var db = _factory.CreateDbContext();
        return await db.DishOptions.Where(o => o.DishId == _chicken && o.Label == label).Select(o => o.Id).SingleAsync();
    }

    [Fact]
    public async Task Favorite_names_are_required_and_unique_and_orders_must_be_the_clients_own()
    {
        var client = await RegisterAsync();
        var order = await OrderAsync(client);
        (await client.PostAsJsonAsync("/api/account/favorites", new { name = "שישי", orderId = order.Id }, TestFiles.Json)).EnsureSuccessStatusCode();

        await (await client.PostAsJsonAsync("/api/account/favorites", new { name = " ", orderId = order.Id }, TestFiles.Json))
            .AssertInvalid("name", "required");
        await (await client.PostAsJsonAsync("/api/account/favorites", new { name = "שישי", orderId = order.Id }, TestFiles.Json))
            .AssertInvalid("name", "duplicate");

        var other = await RegisterAsync(OtherPhone);
        var response = await other.PostAsJsonAsync("/api/account/favorites", new { name = "שלי", orderId = order.Id }, TestFiles.Json);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---------- Recommendations ----------

    [Fact]
    public async Task Recommendations_are_saved_and_listed_for_their_author_only()
    {
        var client = await RegisterAsync();
        var other = await RegisterAsync(OtherPhone);

        var saved = await (await client.PostAsJsonAsync("/api/account/recommendations", new { text = " קובה סלק " }, TestFiles.Json))
            .Read<RecommendationDto>();

        Assert.Equal("קובה סלק", saved.Text);
        Assert.False(saved.IsHandled);
        Assert.Equal(saved.Id, Assert.Single(await (await client.GetAsync("/api/account/recommendations")).Read<List<RecommendationDto>>()).Id);
        Assert.Empty(await (await other.GetAsync("/api/account/recommendations")).Read<List<RecommendationDto>>());
    }

    [Fact]
    public async Task A_recommendation_needs_text_of_a_sensible_length()
    {
        var client = await RegisterAsync();

        await (await client.PostAsJsonAsync("/api/account/recommendations", new { text = "  " }, TestFiles.Json))
            .AssertInvalid("text", "required");
        await (await client.PostAsJsonAsync("/api/account/recommendations", new { text = new string('א', 1001) }, TestFiles.Json))
            .AssertInvalid("text", "tooLong");
    }

    [Fact]
    public async Task Recommendations_per_day_are_limited()
    {
        var client = await RegisterAsync();
        for (var i = 0; i < MaxRecommendationsPerDay; i++)
            (await client.PostAsJsonAsync("/api/account/recommendations", new { text = $"רעיון {i}" }, TestFiles.Json)).EnsureSuccessStatusCode();

        await (await client.PostAsJsonAsync("/api/account/recommendations", new { text = "עוד אחד" }, TestFiles.Json))
            .AssertInvalid("text", "tooManyRecommendations");
    }

    [Fact]
    public async Task Logging_out_clears_the_session_cookie()
    {
        var client = await RegisterAsync();

        var response = await client.PostAsync("/api/account/logout", null);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Contains(response.Headers.GetValues("Set-Cookie"), c => c.StartsWith(ApiFactory.SiteId + "_user=;"));
    }
}
