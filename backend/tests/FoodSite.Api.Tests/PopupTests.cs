using System.Net;
using System.Net.Http.Json;
using FoodSite.Api.Controllers;
using FoodSite.Api.Popup;
using static FoodSite.Api.Controllers.Admin.PopupController;

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

    private Task<HttpResponseMessage> Save(PopupInput input) => _admin.PutAsJsonAsync("/api/admin/popup", input, TestFiles.Json);

    private async Task<EntryPopup.Dto?> ClientPopup() =>
        (await _factory.CreateApiClient().GetAsync("/api/site").Read<PublicController.SiteDto>()).Popup;

    [Fact]
    public async Task Nothing_is_shown_until_the_popup_is_turned_on()
    {
        Assert.Null(await ClientPopup());
        var initial = await _admin.GetAsync("/api/admin/popup").Read<EntryPopup.Dto>();
        Assert.False(initial.Enabled);
        Assert.Equal(("medium", "always", "load", 0), (initial.Size, initial.Frequency, initial.Trigger, initial.DelaySeconds));

        (await Save(new PopupInput(false, "large", "session", "exit", 15, "מבצע", "טקסט", null, null))).EnsureSuccessStatusCode();
        Assert.Null(await ClientPopup());

        (await Save(new PopupInput(true, "large", "session", "exit", 15, " מבצע ", "טקסט", " לפרטים ", "example.com/sale"))).EnsureSuccessStatusCode();
        var shown = await ClientPopup();
        Assert.NotNull(shown);
        Assert.Equal(("large", "session", "exit", 15, "מבצע", "לפרטים", "https://example.com/sale"), (shown.Size, shown.Frequency, shown.Trigger, shown.DelaySeconds, shown.Title, shown.ButtonText, shown.ButtonUrl));
    }

    [Theory]
    [InlineData(true, null, null, null, "Title", "required")]
    [InlineData(false, "huge", "מבצע", null, "Size", "invalid")]
    [InlineData(false, "small", "מבצע", "javascript:alert(1)", "ButtonUrl", "link")]
    public async Task Invalid_popups_are_refused(bool enabled, string? size, string? title, string? url, string field, string code)
    {
        var response = await Save(new PopupInput(enabled, size, null, null, null, title, null, url is null ? null : "לחצו", url));
        await response.AssertInvalid(field, code);
        Assert.False((await _admin.GetAsync("/api/admin/popup").Read<EntryPopup.Dto>()).Enabled);
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
        var first = await (await _admin.PutAsync("/api/admin/popup/image", TestFiles.Upload(TestFiles.Jpeg))).Read<EntryPopup.Dto>();
        Assert.StartsWith($"https://images.test/{ApiFactory.SiteId}/popup/", first.ImageUrl);

        var second = await (await _admin.PutAsync("/api/admin/popup/image", TestFiles.Upload(TestFiles.Png, "p.png", "image/png"))).Read<EntryPopup.Dto>();
        Assert.NotEqual(first.ImageUrl, second.ImageUrl);
        Assert.Single(_factory.Images.Deleted);

        // Saving the text leaves the picture alone.
        (await Save(new PopupInput(true, null, null, null, null, "מבצע", null, null, null))).EnsureSuccessStatusCode();
        Assert.Equal(second.ImageUrl, (await ClientPopup())!.ImageUrl);

        var removed = await (await _admin.DeleteAsync("/api/admin/popup/image")).Read<EntryPopup.Dto>();
        Assert.Null(removed.ImageUrl);
        Assert.Equal(2, _factory.Images.Deleted.Count);
    }

    [Fact]
    public async Task A_file_that_is_not_a_picture_is_refused()
    {
        var response = await _admin.PutAsync("/api/admin/popup/image", TestFiles.Upload("<svg/>"u8.ToArray(), "x.jpg", "image/jpeg"));
        await response.AssertInvalid("file", "imageType");
    }

    [Fact]
    public async Task Only_the_admin_can_change_the_popup()
    {
        var response = await _factory.CreateApiClient().PutAsJsonAsync("/api/admin/popup", new PopupInput(true, null, null, null, null, "x", null, null, null), TestFiles.Json);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
