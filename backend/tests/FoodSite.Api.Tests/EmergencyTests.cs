using System.Net;
using System.Net.Http.Json;
using FoodSite.Api.Controllers;
using static FoodSite.Api.Controllers.Admin.EmergencyController;

namespace FoodSite.Api.Tests;

[Collection(PostgresCollection.Name)]
public sealed class EmergencyTests(PostgresFixture postgres) : IAsyncLifetime
{
    private readonly ApiFactory _factory = new(postgres);
    private HttpClient _admin = null!;

    public async Task InitializeAsync()
    {
        _admin = await _factory.CreateAdminClientAsync();
        (await _admin.PutAsJsonAsync("/api/admin/contact", new { name = "אמא", phone = "050-1234567" })).EnsureSuccessStatusCode();
    }

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private Task<HttpResponseMessage> Save(EmergencyInput input) => _admin.PutAsJsonAsync("/api/admin/emergency", input, TestFiles.Json);

    private async Task<PublicController.SiteDto> ClientSite() => await _factory.CreateApiClient().GetAsync("/api/site").Read<PublicController.SiteDto>();

    [Fact]
    public async Task Nothing_changes_for_clients_until_emergency_mode_is_on()
    {
        Assert.Null((await ClientSite()).Emergency);
        (await Save(new EmergencyInput(false, "052-9999999", "הודעה"))).EnsureSuccessStatusCode();
        Assert.Null((await ClientSite()).Emergency);
    }

    [Fact]
    public async Task Emergency_mode_uses_the_main_contacts_phone_and_the_default_message_when_left_empty()
    {
        (await Save(new EmergencyInput(true, null, null))).EnsureSuccessStatusCode();
        var emergency = (await ClientSite()).Emergency;
        Assert.NotNull(emergency);
        Assert.Equal("050-1234567", emergency.Phone);
        Assert.Null(emergency.Message);
    }

    [Fact]
    public async Task The_admin_can_set_another_phone_and_message()
    {
        (await Save(new EmergencyInput(true, " 052-9999999 ", " סגור היום "))).EnsureSuccessStatusCode();
        var emergency = (await ClientSite()).Emergency;
        Assert.Equal(("052-9999999", "סגור היום"), (emergency!.Phone, emergency.Message));

        var saved = await _admin.GetAsync("/api/admin/emergency").Read<EmergencyAdminDto>();
        Assert.True(saved.Enabled);
        Assert.Equal("052-9999999", saved.Phone);
    }

    [Fact]
    public async Task A_bad_phone_or_a_too_long_message_is_refused()
    {
        await (await Save(new EmergencyInput(true, "abc", null))).AssertInvalid("phone", "phone");
        await (await Save(new EmergencyInput(true, null, new string('א', MessageMaxLength + 1)))).AssertInvalid("message", "tooLong");
        Assert.Null((await ClientSite()).Emergency);
    }

    [Fact]
    public async Task No_order_is_taken_in_emergency_mode_and_orders_resume_when_it_is_off()
    {
        (await Save(new EmergencyInput(true, null, null))).EnsureSuccessStatusCode();
        var client = _factory.CreateApiClient();
        var blocked = await client.PostAsJsonAsync("/api/orders", new { phone = "050-123-4567", name = "דנה", items = Array.Empty<object>() }, TestFiles.Json);
        await blocked.AssertInvalid("emergency", "emergencyMode");

        (await Save(new EmergencyInput(false, null, null))).EnsureSuccessStatusCode();
        var open = await client.PostAsJsonAsync("/api/orders", new { phone = "050-123-4567", name = "דנה", items = Array.Empty<object>() }, TestFiles.Json);
        Assert.Equal(HttpStatusCode.BadRequest, open.StatusCode);
        Assert.DoesNotContain("emergencyMode", await open.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Only_the_admin_can_use_emergency_mode()
    {
        var anonymous = _factory.CreateApiClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/admin/emergency")).StatusCode);
    }
}
