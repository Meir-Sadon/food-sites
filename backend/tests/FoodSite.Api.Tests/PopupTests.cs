using System.Net;
using System.Net.Http.Json;
using FoodSite.Api.Controllers;
using FoodSite.Api.Popup;
using FoodSite.Api.Sites;
using static FoodSite.Api.Controllers.Admin.PopupController;
using static FoodSite.Api.Controllers.Admin.SettingsController;

namespace FoodSite.Api.Tests;

public class PopupUrlTests
{
    [Theory]
    [InlineData("https://example.com/sale", "https://example.com/sale")]
    [InlineData(" example.com/sale ", "https://example.com/sale")]
    [InlineData("/about", "/about")]
    public void Addresses_are_accepted(string typed, string expected) => Assert.Equal(expected, EntryPopup.NormalizeUrl(typed));

    [Theory]
    [InlineData("javascript:alert(1)")]
    [InlineData("http://example.com")]
    [InlineData("//evil.com")]
    [InlineData("/\\evil.com")]
    [InlineData("/two words")]
    [InlineData("/")]
    public void Other_addresses_are_refused(string typed) => Assert.Null(EntryPopup.NormalizeUrl(typed));
}

[Collection(PostgresCollection.Name)]
public sealed class PopupTests(PostgresFixture postgres) : IAsyncLifetime
{
    private readonly ApiFactory _factory = new(postgres);
    private HttpClient _admin = null!;

    public async Task InitializeAsync() => _admin = await _factory.CreateAdminClientAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private Task<HttpResponseMessage> Save(PopupInput input, int slot = 1) => _admin.PutAsJsonAsync($"/api/admin/popups/{slot}", input, TestFiles.Json);

    private async Task<PublicController.SiteDto> ClientSite() => await _factory.CreateApiClient().GetAsync("/api/site").Read<PublicController.SiteDto>();

    private async Task<IReadOnlyList<EntryPopup.Dto>> ClientPopups() => (await ClientSite()).Popups!;

    private static PopupInput Simple(string title = "מבצע", bool enabled = true) => new(enabled, null, null, null, null, title, null, null, null);

    [Fact]
    public async Task Nothing_is_shown_until_a_popup_is_turned_on()
    {
        Assert.Empty(await ClientPopups());
        var slots = await _admin.GetAsync("/api/admin/popups").Read<List<EntryPopup.Dto>>();
        Assert.Equal([1, 2, 3], slots.Select(p => p.Slot));
        Assert.All(slots, p =>
        {
            Assert.False(p.Enabled);
            Assert.Equal(("medium", "always", "load", 0), (p.Size, p.Frequency, p.Trigger, p.DelaySeconds));
            Assert.Null(p.Login);
            Assert.False(p.OrderTotal);
        });

        (await Save(new PopupInput(false, "large", "session", "exit", 15, "מבצע", "טקסט", null, null))).EnsureSuccessStatusCode();
        Assert.Empty(await ClientPopups());

        (await Save(new PopupInput(true, "large", "session", "exit", 15, " מבצע ", "טקסט", " לפרטים ", "example.com/sale"))).EnsureSuccessStatusCode();
        var shown = Assert.Single(await ClientPopups());
        Assert.Equal((1, "large", "session", "exit", 15, "מבצע", "לפרטים", "https://example.com/sale"), (shown.Slot, shown.Size, shown.Frequency, shown.Trigger, shown.DelaySeconds, shown.Title, shown.ButtonText, shown.ButtonUrl));
    }

    [Fact]
    public async Task A_button_can_point_to_a_page_of_the_site()
    {
        (await Save(new PopupInput(true, null, null, null, null, "מבצע", null, "לתפריט", "/about"))).EnsureSuccessStatusCode();
        Assert.Equal("/about", Assert.Single(await ClientPopups()).ButtonUrl);
    }

    [Fact]
    public async Task Three_popups_are_kept_apart_and_shown_in_slot_order()
    {
        (await Save(Simple("שלישי"), 3)).EnsureSuccessStatusCode();
        (await Save(Simple("ראשון"), 1)).EnsureSuccessStatusCode();
        (await Save(Simple("שני", enabled: false), 2)).EnsureSuccessStatusCode();

        Assert.Equal(["ראשון", "שלישי"], (await ClientPopups()).Select(p => p.Title));
        var all = await _admin.GetAsync("/api/admin/popups").Read<List<EntryPopup.Dto>>();
        Assert.Equal(["ראשון", "שני", "שלישי"], all.Select(p => p.Title));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(4)]
    public async Task There_are_only_three_slots(int slot)
    {
        Assert.Equal(HttpStatusCode.NotFound, (await Save(Simple(), slot)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _admin.PutAsync($"/api/admin/popups/{slot}/image", TestFiles.Upload(TestFiles.Jpeg))).StatusCode);
    }

    [Fact]
    public async Task The_conditions_are_saved_with_the_popup()
    {
        var saved = await (await Save(new PopupInput(true, null, null, null, null, "מבצע", null, null, null,
            Login: "loggedIn", Activity: "inactive", OrderSource: "favorite", OrderTotal: true, MinTotal: 100, MaxTotal: 300))).Read<EntryPopup.Dto>();
        Assert.Equal(("loggedIn", "inactive", "favorite", true, 100m, 300m), (saved.Login, saved.Activity, saved.OrderSource, saved.OrderTotal, saved.MinTotal, saved.MaxTotal));
        Assert.Equal(saved, Assert.Single(await ClientPopups()));

        // Unticking the conditions clears them, and the totals with the total condition.
        var cleared = await (await Save(Simple())).Read<EntryPopup.Dto>();
        Assert.Equal((null, null, null, false, null, null), (cleared.Login, cleared.Activity, cleared.OrderSource, cleared.OrderTotal, cleared.MinTotal, cleared.MaxTotal));
    }

    [Fact]
    public async Task One_limit_of_the_order_total_is_enough()
    {
        var above = await (await Save(new PopupInput(true, null, null, null, null, "מבצע", null, null, null, OrderTotal: true, MinTotal: 150))).Read<EntryPopup.Dto>();
        Assert.Equal((150m, (decimal?)null), (above.MinTotal, above.MaxTotal));
        var below = await (await Save(new PopupInput(true, null, null, null, null, "מבצע", null, null, null, OrderTotal: true, MaxTotal: 80))).Read<EntryPopup.Dto>();
        Assert.Equal(((decimal?)null, 80m), (below.MinTotal, below.MaxTotal));
    }

    [Theory]
    [InlineData("sometimes", null, null, null, null, "Login")]
    [InlineData(null, "tired", null, null, null, "Activity")]
    [InlineData(null, null, "bought", null, null, "OrderSource")]
    [InlineData(null, null, null, -1, null, "MinTotal")]
    [InlineData(null, null, null, null, 1000000, "MaxTotal")]
    [InlineData(null, null, null, 200, 100, "MaxTotal")]
    public async Task An_unknown_condition_or_a_total_out_of_range_is_refused(string? login, string? activity, string? source, int? min, int? max, string field)
    {
        var input = new PopupInput(false, null, null, null, null, "מבצע", null, null, null, login, activity, source, true, min, max);
        await (await Save(input)).AssertInvalid(field, "invalid");
    }

    [Theory]
    [InlineData(true, null, null, null, "Title", "required")]
    [InlineData(false, "huge", "מבצע", null, "Size", "invalid")]
    [InlineData(false, "small", "מבצע", "javascript:alert(1)", "ButtonUrl", "link")]
    public async Task Invalid_popups_are_refused(bool enabled, string? size, string? title, string? url, string field, string code)
    {
        var response = await Save(new PopupInput(enabled, size, null, null, null, title, null, url is null ? null : "לחצו", url));
        await response.AssertInvalid(field, code);
        Assert.False((await _admin.GetAsync("/api/admin/popups").Read<List<EntryPopup.Dto>>())[0].Enabled);
    }

    [Fact]
    public async Task An_unknown_trigger_or_a_delay_out_of_range_is_refused()
    {
        await (await Save(new PopupInput(false, null, null, "sometimes", 0, "מבצע", null, null, null))).AssertInvalid("Trigger", "invalid");
        await (await Save(new PopupInput(false, null, null, "load", 121, "מבצע", null, null, null))).AssertInvalid("DelaySeconds", "invalid");
        await (await Save(new PopupInput(false, null, null, "load", -1, "מבצע", null, null, null))).AssertInvalid("DelaySeconds", "invalid");
    }

    [Fact]
    public async Task A_button_needs_both_its_text_and_its_address()
    {
        await (await Save(new PopupInput(false, "small", null, null, null, "מבצע", null, "לחצו", null))).AssertInvalid("ButtonUrl", "required");
        await (await Save(new PopupInput(false, "small", null, null, null, "מבצע", null, null, "https://example.com"))).AssertInvalid("ButtonText", "required");
    }

    [Fact]
    public async Task The_picture_is_replaced_and_removed()
    {
        var first = await (await _admin.PutAsync("/api/admin/popups/2/image", TestFiles.Upload(TestFiles.Jpeg))).Read<EntryPopup.Dto>();
        Assert.Equal(2, first.Slot);
        Assert.StartsWith($"https://images.test/{ApiFactory.SiteId}/popup/", first.ImageUrl);

        var second = await (await _admin.PutAsync("/api/admin/popups/2/image", TestFiles.Upload(TestFiles.Png, "p.png", "image/png"))).Read<EntryPopup.Dto>();
        Assert.NotEqual(first.ImageUrl, second.ImageUrl);
        Assert.Single(_factory.Images.Deleted);

        // Saving the text leaves the picture alone, and another slot has none.
        (await Save(Simple(), 2)).EnsureSuccessStatusCode();
        (await Save(Simple("אחר"), 1)).EnsureSuccessStatusCode();
        var shown = await ClientPopups();
        Assert.Equal(second.ImageUrl, shown.Single(p => p.Slot == 2).ImageUrl);
        Assert.Null(shown.Single(p => p.Slot == 1).ImageUrl);

        var removed = await (await _admin.DeleteAsync("/api/admin/popups/2/image")).Read<EntryPopup.Dto>();
        Assert.Null(removed.ImageUrl);
        Assert.Equal(2, _factory.Images.Deleted.Count);
    }

    [Fact]
    public async Task A_file_that_is_not_a_picture_is_refused()
    {
        var response = await _admin.PutAsync("/api/admin/popups/1/image", TestFiles.Upload("<svg/>"u8.ToArray(), "x.jpg", "image/jpeg"));
        await response.AssertInvalid("file", "imageType");
    }

    [Fact]
    public async Task Only_the_admin_can_change_the_popup()
    {
        var response = await _factory.CreateApiClient().PutAsJsonAsync("/api/admin/popups/1", Simple("x"), TestFiles.Json);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task A_client_is_inactive_after_three_months_until_the_admin_says_otherwise()
    {
        Assert.Equal(new ClientActivity.Period(3, "month"), (await ClientSite()).InactiveAfter);
        Assert.Equal(new ClientActivity.Period(3, "month"), (await _admin.GetAsync("/api/admin/settings").Read<SettingsDto>()).InactiveAfter);

        var saved = await (await _admin.PutAsJsonAsync("/api/admin/settings/inactive-after", new InactiveAfterInput(6, "week"), TestFiles.Json)).Read<SettingsDto>();
        Assert.Equal(new ClientActivity.Period(6, "week"), saved.InactiveAfter);
        Assert.Equal(new ClientActivity.Period(6, "week"), (await ClientSite()).InactiveAfter);

        // A missing field keeps its value; saving the other settings leaves the period alone.
        var unit = await (await _admin.PutAsJsonAsync("/api/admin/settings/inactive-after", new InactiveAfterInput(null, "month"), TestFiles.Json)).Read<SettingsDto>();
        Assert.Equal(new ClientActivity.Period(6, "month"), unit.InactiveAfter);
    }

    [Theory]
    [InlineData(0, null, "Amount")]
    [InlineData(105, null, "Amount")]
    [InlineData(null, "year", "Unit")]
    public async Task An_inactivity_period_out_of_range_is_refused(int? amount, string? unit, string field)
    {
        var response = await _admin.PutAsJsonAsync("/api/admin/settings/inactive-after", new InactiveAfterInput(amount, unit), TestFiles.Json);
        await response.AssertInvalid(field, "invalid");
    }
}
