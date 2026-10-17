using System.Net;
using System.Net.Http.Json;
using static FoodSite.Api.Controllers.Admin.AccessibilityAdminController;

namespace FoodSite.Api.Tests;

[Collection(PostgresCollection.Name)]
public sealed class AccessibilityTests(PostgresFixture postgres) : IAsyncLifetime
{
    private readonly ApiFactory _factory = new(postgres);
    private HttpClient _admin = null!;

    public async Task InitializeAsync() => _admin = await _factory.CreateAdminClientAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private static object Input(string? name = " דנה ", string? phone = "050-1234567", string? email = "a11y@example.com", string? notes = "") =>
        new { name, phone, email, notes };

    [Theory]
    [InlineData("GET")]
    [InlineData("PUT")]
    public async Task Admin_endpoint_needs_an_admin_session(string method)
    {
        var request = new HttpRequestMessage(new HttpMethod(method), "/api/admin/accessibility") { Content = JsonContent.Create(new { }) };
        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateApiClient().SendAsync(request)).StatusCode);
    }

    [Fact]
    public async Task Coordinator_is_saved_trimmed_and_public()
    {
        var saved = await (await _admin.PutAsJsonAsync("/api/admin/accessibility", Input())).Read<AccessibilityDto>();
        Assert.Equal("דנה", saved.Name);
        Assert.Null(saved.Notes);
        Assert.NotNull(saved.UpdatedAt);

        var pub = await (await _factory.CreateApiClient().GetAsync("/api/accessibility")).Read<AccessibilityDto>();
        Assert.Equal("a11y@example.com", pub.Email);
    }

    [Fact]
    public async Task Everything_is_optional_but_phone_and_email_must_be_valid()
    {
        (await _admin.PutAsJsonAsync("/api/admin/accessibility", Input(null, null, null))).EnsureSuccessStatusCode();
        await (await _admin.PutAsJsonAsync("/api/admin/accessibility", Input(phone: "12"))).AssertInvalid("Phone", "phone");
        await (await _admin.PutAsJsonAsync("/api/admin/accessibility", Input(email: "nope"))).AssertInvalid("Email", "email");
    }
}
