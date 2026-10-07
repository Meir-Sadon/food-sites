using System.Net;
using System.Net.Http.Json;
using static FoodSite.Api.Controllers.Admin.ContactsController;

namespace FoodSite.Api.Tests;

[Collection(PostgresCollection.Name)]
public sealed class ContactsAdminTests(PostgresFixture postgres) : IAsyncLifetime
{
    private readonly ApiFactory _factory = new(postgres);
    private HttpClient _admin = null!;

    public async Task InitializeAsync() => _admin = await _factory.CreateAdminClientAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private static object Contact(string? name = "אמא", string? phone = "050-1234567", string? email = "ima@example.com") =>
        new { name, phone, address = " חיפה ", email, openingHours = "" };

    private Task<HttpResponseMessage> AddPhone(string? phone, string? name = null) =>
        _admin.PostAsJsonAsync("/api/admin/notify-phones", new { phone, name });

    [Theory]
    [InlineData("GET", "/api/admin/contact")]
    [InlineData("PUT", "/api/admin/contact")]
    [InlineData("GET", "/api/admin/notify-phones")]
    [InlineData("POST", "/api/admin/notify-phones")]
    [InlineData("DELETE", "/api/admin/notify-phones/1")]
    public async Task Contacts_endpoints_need_an_admin_session(string method, string path)
    {
        var request = new HttpRequestMessage(new HttpMethod(method), path) { Content = JsonContent.Create(new { }) };
        var response = await _factory.CreateApiClient().SendAsync(request);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Contact_is_saved_trimmed_and_shown_on_the_public_site()
    {
        var saved = await (await _admin.PutAsJsonAsync("/api/admin/contact", Contact())).Read<ContactDto>();
        Assert.Equal(new ContactDto("אמא", "050-1234567", "חיפה", "ima@example.com", null), saved);

        var site = await (await _factory.CreateApiClient().GetAsync("/api/site")).Read<Controllers.PublicController.SiteDto>();
        Assert.Equal("050-1234567", site.Contact.Phone);
        Assert.Equal("חיפה", site.Contact.Address);
    }

    [Fact]
    public async Task Contact_needs_a_name_and_a_valid_phone()
    {
        await (await _admin.PutAsJsonAsync("/api/admin/contact", Contact(name: " "))).AssertInvalid("Name", "required");
        await (await _admin.PutAsJsonAsync("/api/admin/contact", Contact(phone: null))).AssertInvalid("Phone", "required");
        await (await _admin.PutAsJsonAsync("/api/admin/contact", Contact(phone: "12"))).AssertInvalid("Phone", "phone");
        await (await _admin.PutAsJsonAsync("/api/admin/contact", Contact(email: "not-an-email"))).AssertInvalid("Email", "email");
    }

    [Fact]
    public async Task Notify_phones_are_stored_in_local_form_without_duplicates()
    {
        var added = await (await AddPhone("+972 50-123-4567", " דוד ")).Read<NotifyPhoneDto>();
        Assert.Equal(("0501234567", "דוד"), (added.Phone, added.Name));

        await (await AddPhone("0501234567")).AssertInvalid("Phone", "duplicate");
        await (await AddPhone("abc")).AssertInvalid("Phone", "phone");
        await (await AddPhone(null)).AssertInvalid("Phone", "required");

        var list = await (await _admin.GetAsync("/api/admin/notify-phones")).Read<List<NotifyPhoneDto>>();
        Assert.Single(list);
    }

    [Fact]
    public async Task Notify_phone_can_be_removed()
    {
        var added = await (await AddPhone("0501234567")).Read<NotifyPhoneDto>();

        Assert.Equal(HttpStatusCode.NoContent, (await _admin.DeleteAsync($"/api/admin/notify-phones/{added.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _admin.DeleteAsync($"/api/admin/notify-phones/{added.Id}")).StatusCode);
    }
}
