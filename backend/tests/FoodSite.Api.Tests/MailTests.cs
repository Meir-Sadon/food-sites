using System.Net;
using System.Net.Http.Json;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Mail;
using FoodSite.Api.Orders;
using static FoodSite.Api.Controllers.Admin.CategoriesController;
using static FoodSite.Api.Controllers.Admin.DishesController;
using static FoodSite.Api.Controllers.Admin.SettingsController;
using static FoodSite.Api.Controllers.Admin.SupplyDaysController;
using static FoodSite.Api.Controllers.PublicController;

namespace FoodSite.Api.Tests;

[Collection(PostgresCollection.Name)]
public sealed class MailTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string Owner = "owner@example.com";

    private readonly ApiFactory _factory = new(postgres);
    private HttpClient _admin = null!;

    public async Task InitializeAsync() => _admin = await _factory.CreateAdminClientAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private static object Settings(string? ownerEmail, bool? ownerChangeMails = null) => new
    {
        deliveryEnabled = true, pickupEnabled = true, deliveryAreaText = (string?)null, deliveryFeeText = (string?)null,
        kashrutText = (string?)null, paymentPhone = "050-1234567", minimumOrderAmount = (decimal?)null, ownerEmail, ownerChangeMails,
    };

    private Task<HttpResponseMessage> SaveSettings(string? ownerEmail, bool? ownerChangeMails = null) =>
        _admin.PutAsJsonAsync("/api/admin/settings", Settings(ownerEmail, ownerChangeMails));

    private async Task<DishDto> CreateDish(string name)
    {
        var category = await (await _admin.PostAsJsonAsync("/api/admin/categories", new { name = "עופות" })).Read<CategoryDto>();
        return await (await _admin.PostAsJsonAsync("/api/admin/dishes", new DishInput(
            name, category.Id, null, null, SellBy.Units, ChoiceMode.Fixed, null, null, null, null, false, false,
            [new OptionInput(null, "יחידה", 1, 40, true)], []), TestFiles.Json)).Read<DishDto>();
    }

    private async Task<HttpResponseMessage> PlaceOrder(DishDto dish)
    {
        var days = Enum.GetValues<DayOfWeek>().Select(d => new SupplyDayDto(d, true, (DayOfWeek)(((int)d + 6) % 7), new TimeOnly(0, 0)));
        (await _admin.PutAsJsonAsync("/api/admin/supply-days", days, TestFiles.Json)).EnsureSuccessStatusCode();
        var client = _factory.CreateApiClient();
        var menu = await (await client.GetAsync("/api/menu")).Read<MenuDto>();
        return await client.PostAsJsonAsync("/api/orders", new
        {
            phone = "050-123-4567", name = "דנה", city = "אשקלון", street = "הרצל", houseNumber = "1",
            supplyDate = menu.SupplyDates[0].Date.ToString("yyyy-MM-dd"), fulfillmentMethod = "Delivery", paymentMethod = "OnDelivery",
            items = new[] { new { dishId = dish.Id, optionId = (int?)null, quantity = 2m, addOns = Array.Empty<object>() } },
        }, TestFiles.Json);
    }

    [Fact]
    public async Task The_confirmation_names_the_allergens_of_each_ordered_dish()
    {
        var category = await (await _admin.PostAsJsonAsync("/api/admin/categories", new { name = "סלטים" })).Read<CategoryDto>();
        var dish = await (await _admin.PostAsJsonAsync("/api/admin/dishes", new DishInput(
            "טחינה", category.Id, null, "שומשום", SellBy.Units, ChoiceMode.Fixed, null, null, null, null, false, false,
            [new OptionInput(null, "יחידה", 1, 20, true)], []), TestFiles.Json)).Read<DishDto>();

        var confirmation = await (await PlaceOrder(dish)).Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.Equal("שומשום", confirmation.GetProperty("items")[0].GetProperty("allergenInfo").GetString());
    }

    [Fact]
    public async Task The_owner_address_is_saved_validated_and_kept_when_left_out()
    {
        Assert.Equal("", (await _admin.GetAsync("/api/admin/settings").Read<SettingsDto>()).OwnerEmail);

        Assert.Equal(HttpStatusCode.BadRequest, (await SaveSettings("not an email")).StatusCode);
        Assert.Equal(Owner, (await (await SaveSettings(" " + Owner + " ")).Read<SettingsDto>()).OwnerEmail);
        // An older client that leaves it out keeps it; an empty one turns the mails off.
        Assert.Equal(Owner, (await (await SaveSettings(null)).Read<SettingsDto>()).OwnerEmail);
        Assert.Equal("", (await (await SaveSettings("")).Read<SettingsDto>()).OwnerEmail);
    }

    [Fact]
    public async Task Several_owner_addresses_are_validated_and_all_get_the_order_mail()
    {
        Assert.Equal(HttpStatusCode.BadRequest, (await SaveSettings(Owner + ", nope")).StatusCode);
        var saved = await (await SaveSettings(" " + Owner + " ,second@example.com;" + Owner.ToUpperInvariant())).Read<SettingsDto>();
        Assert.Equal(Owner + ", second@example.com", saved.OwnerEmail);

        var dish = await CreateDish("עוף בתנור");
        Assert.Equal(HttpStatusCode.OK, (await PlaceOrder(dish)).StatusCode);
        await _factory.Mail.NextAsync(m => m.To == Owner && m.Subject.Contains("הזמנה חדשה"));
        await _factory.Mail.NextAsync(m => m.To == "second@example.com" && m.Subject.Contains("הזמנה חדשה"));
    }

    [Fact]
    public async Task The_change_mail_choice_is_off_by_default_and_kept_when_left_out()
    {
        Assert.False((await _admin.GetAsync("/api/admin/settings").Read<SettingsDto>()).OwnerChangeMails);
        Assert.True((await (await SaveSettings(Owner, true)).Read<SettingsDto>()).OwnerChangeMails);
        Assert.True((await (await SaveSettings(Owner)).Read<SettingsDto>()).OwnerChangeMails);
        Assert.False((await (await SaveSettings(Owner, false)).Read<SettingsDto>()).OwnerChangeMails);
    }

    [Fact]
    public async Task A_new_order_is_mailed_to_the_owner_and_a_mail_outage_does_not_fail_it()
    {
        var dish = await CreateDish("עוף בתנור");
        (await SaveSettings(Owner)).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.OK, (await PlaceOrder(dish)).StatusCode);
        // The setup's own changes are mailed too, so pick the order's mail.
        var (to, subject, text) = await _factory.Mail.NextAsync(m => m.Subject.Contains("הזמנה חדשה"));
        Assert.Equal(Owner, to);
        Assert.Contains("עוף בתנור", text);
        Assert.Contains("דנה", text);
        // A link that opens this order in the admin, on the host the client ordered from.
        Assert.Matches(@"https?://[^\s/]+/admin/orders/\d+", text);

        _factory.Mail.Fail = true;
        Assert.Equal(HttpStatusCode.OK, (await PlaceOrder(dish)).StatusCode);
    }

    [Fact]
    public async Task Without_an_owner_address_nothing_is_mailed()
    {
        var dish = await CreateDish("עוף בתנור");
        Assert.Equal(HttpStatusCode.OK, (await PlaceOrder(dish)).StatusCode);
        await Task.Delay(3000);
        Assert.Empty(_factory.Mail.Sent);
    }

    [Fact]
    public async Task Changes_to_dishes_and_settings_are_mailed_as_one_summary_saying_who_changed_what()
    {
        (await SaveSettings(Owner, true)).EnsureSuccessStatusCode();

        var dish = await CreateDish("שניצל");
        var edited = await _admin.PutAsJsonAsync($"/api/admin/dishes/{dish.Id}", new DishInput(
            "שניצל פריך", dish.CategoryId, null, null, SellBy.Units, ChoiceMode.Fixed, null, null, null, null, false, false,
            [new OptionInput(dish.Options[0].Id, "יחידה", 1, 45, true)], []), TestFiles.Json);
        edited.EnsureSuccessStatusCode();

        var (to, subject, text) = await _factory.Mail.NextAsync(m => m.Text.Contains("שניצל פריך"));
        Assert.Equal(Owner, to);
        Assert.Contains("שינויים", subject);
        Assert.Contains("בעל העסק", text);
        Assert.Contains("מנה", text);
    }

    [Fact]
    public void Changes_wait_for_quiet_and_orders_are_not_mailed_about()
    {
        var clock = new TestClock();
        var digest = new ChangeDigest(clock);
        AuditEntry Entry(string type) => new() { At = clock.GetUtcNow(), Actor = "owner", EntityType = type, Action = AuditAction.Modified };

        digest.Add([Entry(nameof(Order)), Entry(nameof(Dish))]);
        var quiet = TimeSpan.FromMinutes(2);
        var max = TimeSpan.FromMinutes(15);
        Assert.Empty(digest.TakeDue(quiet, max));

        clock.Advance(TimeSpan.FromMinutes(1));
        digest.Add([Entry(nameof(Settings))]);
        clock.Advance(TimeSpan.FromMinutes(1.5));
        Assert.Empty(digest.TakeDue(quiet, max));

        clock.Advance(TimeSpan.FromMinutes(1));
        Assert.Equal([nameof(Dish), nameof(Settings)], digest.TakeDue(quiet, max).Select(e => e.EntityType));
        Assert.Empty(digest.TakeDue(quiet, max));
    }

    private sealed class TestClock : TimeProvider
    {
        private DateTimeOffset _now = new(2026, 10, 13, 10, 0, 0, TimeSpan.Zero);

        public override DateTimeOffset GetUtcNow() => _now;

        public void Advance(TimeSpan by) => _now += by;
    }
}
