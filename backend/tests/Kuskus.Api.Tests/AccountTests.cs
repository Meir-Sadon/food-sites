using System.Net;
using System.Net.Http.Json;
using Kuskus.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using static Kuskus.Api.Controllers.AccountController;
using static Kuskus.Api.Controllers.Admin.CategoriesController;
using static Kuskus.Api.Controllers.Admin.DishesController;
using static Kuskus.Api.Controllers.Admin.SupplyDaysController;
using static Kuskus.Api.Controllers.OrdersController;
using static Kuskus.Api.Controllers.PhoneVerificationController;
using static Kuskus.Api.Controllers.PublicController;

namespace Kuskus.Api.Tests;

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

    private async Task<string> Verify(string phone)
    {
        Assert.Equal(HttpStatusCode.NoContent, (await _guest.PostAsJsonAsync("/api/phone-verification/send", new { phone })).StatusCode);
        var confirmed = await (await _guest.PostAsJsonAsync(
            "/api/phone-verification/confirm", new { phone, code = _factory.WhatsApp.LastCode(phone) })).Read<ConfirmedDto>();
        return confirmed.Token;
    }

    private static object Profile(string phone, string? token, Action<Dictionary<string, object?>>? change = null)
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
            ["verificationToken"] = token,
        };
        change?.Invoke(input);
        return input;
    }

    /// <summary>A client that carries the session cookie from a login or registration response.</summary>
    private HttpClient WithSession(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, Describe(response));
        var cookie = response.Headers.GetValues("Set-Cookie").Single(c => c.StartsWith("kuskus_user=")).Split(';')[0];
        var client = _factory.CreateApiClient();
        client.DefaultRequestHeaders.Add("Cookie", cookie);
        return client;
    }

    private static string Describe(HttpResponseMessage response) =>
        $"{(int)response.StatusCode}: {response.Content.ReadAsStringAsync().GetAwaiter().GetResult()}";

    private async Task<HttpClient> RegisterAsync(string phone = Phone)
    {
        var token = await Verify(phone);
        return WithSession(await _guest.PostAsJsonAsync("/api/account/register", Profile(phone, token), TestFiles.Json));
    }

    private async Task<ConfirmationDto> OrderAsync(HttpClient client, string phone = Phone, string? token = null)
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
            verificationToken = token,
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
    public async Task Registering_needs_a_confirmed_phone()
    {
        await Verify(Phone);

        var noToken = await _guest.PostAsJsonAsync("/api/account/register", Profile(Phone, null), TestFiles.Json);
        await noToken.AssertInvalid("phone", "phoneNotVerified");

        var otherToken = await Verify(OtherPhone);
        var wrongPhone = await _guest.PostAsJsonAsync("/api/account/register", Profile(Phone, otherToken), TestFiles.Json);
        await wrongPhone.AssertInvalid("phone", "phoneNotVerified");
    }

    [Fact]
    public async Task Registering_requires_name_and_address_and_checks_optional_fields()
    {
        var token = await Verify(Phone);

        var missing = await _guest.PostAsJsonAsync(
            "/api/account/register", Profile(Phone, token, i => { i["fullName"] = " "; i["street"] = null; }), TestFiles.Json);
        await missing.AssertInvalid("fullName", "required");
        await missing.AssertInvalid("street", "required");

        var badEmail = await _guest.PostAsJsonAsync(
            "/api/account/register", Profile(Phone, token, i => i["email"] = "not-an-email"), TestFiles.Json);
        await badEmail.AssertInvalid("email", "email");

        var future = await _guest.PostAsJsonAsync(
            "/api/account/register", Profile(Phone, token, i => i["birthday"] = "2999-01-01"), TestFiles.Json);
        await future.AssertInvalid("birthday", "invalid");

        var optionalOnly = await _guest.PostAsJsonAsync(
            "/api/account/register",
            Profile(Phone, token, i => { i["email"] = null; i["birthday"] = null; i["ethnicBackground"] = null; }),
            TestFiles.Json);
        Assert.True(optionalOnly.IsSuccessStatusCode);
    }

    [Fact]
    public async Task A_phone_can_register_only_once()
    {
        await RegisterAsync();
        var token = await Verify(Phone);

        var again = await _guest.PostAsJsonAsync("/api/account/register", Profile(Phone, token), TestFiles.Json);

        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
    }

    [Fact]
    public async Task Login_with_a_confirmed_phone_starts_a_session()
    {
        await RegisterAsync();
        var token = await Verify(Phone);

        var client = WithSession(await _guest.PostAsJsonAsync("/api/account/login", new { phone = Phone, verificationToken = token }));

        Assert.Equal("דנה כהן", (await (await client.GetAsync("/api/account/me")).Read<ProfileDto>()).FullName);
    }

    [Fact]
    public async Task Login_without_a_confirmed_phone_is_refused()
    {
        await RegisterAsync();

        var response = await _guest.PostAsJsonAsync("/api/account/login", new { phone = Phone, verificationToken = "nope" });

        await response.AssertInvalid("phone", "phoneNotVerified");
    }

    [Fact]
    public async Task Login_of_an_unregistered_phone_says_so()
    {
        var token = await Verify(OtherPhone);

        var response = await _guest.PostAsJsonAsync("/api/account/login", new { phone = OtherPhone, verificationToken = token });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Contains("notRegistered", await response.Content.ReadAsStringAsync());
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
            Profile(Phone, null, i => { i["fullName"] = "דנה לוי"; i["email"] = null; }),
            TestFiles.Json)).Read<ProfileDto>();

        Assert.Equal("דנה לוי", saved.FullName);
        Assert.Null(saved.Email);
        Assert.Equal("דנה לוי", (await (await client.GetAsync("/api/account/me")).Read<ProfileDto>()).FullName);
    }

    [Fact]
    public async Task Changing_the_phone_needs_a_code_for_the_new_number()
    {
        var client = await RegisterAsync();

        var without = await client.PutAsJsonAsync("/api/account/me", Profile(OtherPhone, null), TestFiles.Json);
        await without.AssertInvalid("phone", "phoneNotVerified");

        var token = await Verify(OtherPhone);
        var saved = await (await client.PutAsJsonAsync("/api/account/me", Profile(OtherPhone, token), TestFiles.Json)).Read<ProfileDto>();
        Assert.Equal(OtherPhone, saved.Phone);
    }

    [Fact]
    public async Task The_phone_cannot_be_changed_to_one_that_has_an_account()
    {
        await RegisterAsync(OtherPhone);
        var client = await RegisterAsync();
        var token = await Verify(OtherPhone);

        var response = await client.PutAsJsonAsync("/api/account/me", Profile(OtherPhone, token), TestFiles.Json);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    // ---------- Orders, history and favorites ----------

    [Fact]
    public async Task A_logged_in_client_orders_without_a_code_and_sees_it_in_the_history()
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
        Assert.Equal(3, entry.Items.Count);
        var parent = entry.Items.Single(i => i.ParentItemId is null);
        Assert.Equal("עוף בתנור", parent.DishName);
        Assert.Equal(parent.Id, entry.Items.Single(i => i.DishId == _thigh).ParentItemId);
    }

    [Fact]
    public async Task A_logged_in_client_cannot_order_for_another_phone_without_a_code()
    {
        var client = await RegisterAsync();

        var menu = await (await _guest.GetAsync("/api/menu")).Read<MenuDto>();
        var response = await client.PostAsJsonAsync("/api/orders", new
        {
            phone = OtherPhone,
            name = "דנה",
            city = "חיפה",
            street = "הרצל",
            houseNumber = "1",
            supplyDate = menu.SupplyDates[0].Date.ToString("yyyy-MM-dd"),
            fulfillmentMethod = "Delivery",
            paymentMethod = "OnDelivery",
            items = new[] { new { dishId = _chicken, optionId = (int?)null, quantity = 1m, addOns = Array.Empty<object>() } },
        }, TestFiles.Json);

        await response.AssertInvalid("phone", "phoneNotVerified");
    }

    [Fact]
    public async Task Guest_orders_with_a_registered_phone_join_the_history()
    {
        var client = await RegisterAsync();
        var token = await Verify(Phone);

        var confirmation = await OrderAsync(_guest, Phone, token);

        var history = await (await client.GetAsync("/api/account/orders")).Read<List<HistoryOrderDto>>();
        Assert.Contains(history, h => h.Id == confirmation.Id);
    }

    [Fact]
    public async Task Registering_adopts_earlier_guest_orders_of_the_same_phone()
    {
        var token = await Verify(Phone);
        var confirmation = await OrderAsync(_guest, Phone, token);

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
        Assert.Contains(response.Headers.GetValues("Set-Cookie"), c => c.StartsWith("kuskus_user=;"));
    }
}
