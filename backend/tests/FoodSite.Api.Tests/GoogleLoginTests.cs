using System.Net;
using System.Net.Http.Json;
using FoodSite.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using static FoodSite.Api.Controllers.AccountController;
using static FoodSite.Api.Controllers.PublicController;

namespace FoodSite.Api.Tests;

[Collection(PostgresCollection.Name)]
public sealed class GoogleLoginTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string Phone = "0501234567";

    private readonly ApiFactory _factory = new(postgres, new() { ["Google:ClientId"] = "test-client.apps.googleusercontent.com" });

    public Task InitializeAsync() => Task.CompletedTask;

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    private static ProfileInput Profile(string phone = Phone, string? email = null) =>
        new(phone, "דנה כהן", "אשקלון", "הרצל", "5", "", email, null, null);

    private static GoogleInput Credential(string sub, string? email, bool verified = true, string? name = "Dana") =>
        new(FakeGoogleVerifier.Credential(sub, email, verified, name));

    private async Task<User> AddUser(string phone, string? email, string? googleSub = null)
    {
        await using var db = _factory.CreateDbContext();
        var user = new User { Phone = phone, FullName = "קיים", Address = "", Email = email, GoogleSub = googleSub };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    [Fact]
    public async Task Site_shows_the_client_id_only_when_configured()
    {
        var site = await _factory.CreateApiClient().GetFromJsonAsync<SiteDto>("/api/site", TestFiles.Json);
        Assert.Equal("test-client.apps.googleusercontent.com", site!.GoogleClientId);

        await using var plain = new ApiFactory(postgres);
        var off = await plain.CreateApiClient().GetFromJsonAsync<SiteDto>("/api/site", TestFiles.Json);
        Assert.Null(off!.GoogleClientId);
    }

    [Fact]
    public async Task Endpoints_are_not_found_when_google_is_not_configured()
    {
        await using var plain = new ApiFactory(postgres);
        var response = await plain.CreateApiClient().PostAsJsonAsync("/api/account/google", Credential("g1", "a@b.co"));
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task An_invalid_token_is_unauthorized()
    {
        var response = await _factory.CreateApiClient().PostAsJsonAsync("/api/account/google", new GoogleInput("garbage"));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task An_unknown_person_has_to_register_with_phone_and_address()
    {
        var client = _factory.CreateApiClient();
        var first = await (await client.PostAsJsonAsync("/api/account/google", Credential("g1", "dana@gmail.com"))).Read<GoogleLoginDto>();
        Assert.Null(first.Profile);
        Assert.Equal("dana@gmail.com", first.Registration!.Email);
        Assert.Equal("Dana", first.Registration.FullName);

        var registered = await client.PostAsJsonAsync("/api/account/google/register",
            new GoogleRegisterInput(FakeGoogleVerifier.Credential("g1", "dana@gmail.com", true, "Dana"), Profile()));
        registered.EnsureSuccessStatusCode();
        Assert.Contains("Set-Cookie", registered.Headers.Select(h => h.Key));
        Assert.Equal("dana@gmail.com", (await registered.Read<ProfileDto>()).Email);

        var again = await (await client.PostAsJsonAsync("/api/account/google", Credential("g1", "other@gmail.com"))).Read<GoogleLoginDto>();
        Assert.Equal(Phone, again.Profile!.Phone);
    }

    [Fact]
    public async Task Registering_needs_the_address_and_a_free_phone()
    {
        var client = _factory.CreateApiClient();
        var bad = await client.PostAsJsonAsync("/api/account/google/register",
            new GoogleRegisterInput(FakeGoogleVerifier.Credential("g1", null), Profile() with { City = "" }));
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);

        await AddUser(Phone, null);
        var taken = await client.PostAsJsonAsync("/api/account/google/register",
            new GoogleRegisterInput(FakeGoogleVerifier.Credential("g1", null), Profile()));
        Assert.Equal(HttpStatusCode.Conflict, taken.StatusCode);
    }

    [Fact]
    public async Task A_verified_email_links_to_the_existing_account()
    {
        var existing = await AddUser(Phone, "Dana@Gmail.com");
        var response = await (await _factory.CreateApiClient()
            .PostAsJsonAsync("/api/account/google", Credential("g1", "dana@gmail.com"))).Read<GoogleLoginDto>();

        Assert.Equal(existing.Id, response.Profile!.Id);
        await using var db = _factory.CreateDbContext();
        Assert.Equal("g1", (await db.Users.SingleAsync()).GoogleSub);
    }

    [Fact]
    public async Task An_unverified_email_never_links()
    {
        await AddUser(Phone, "dana@gmail.com");
        var response = await (await _factory.CreateApiClient()
            .PostAsJsonAsync("/api/account/google", Credential("g1", "dana@gmail.com", verified: false))).Read<GoogleLoginDto>();

        Assert.Null(response.Profile);
        Assert.Null(response.Registration!.Email);
    }

    [Fact]
    public async Task An_account_tied_to_another_google_id_is_not_taken_over()
    {
        await AddUser(Phone, "dana@gmail.com", googleSub: "someone-else");
        var response = await (await _factory.CreateApiClient()
            .PostAsJsonAsync("/api/account/google", Credential("g2", "dana@gmail.com"))).Read<GoogleLoginDto>();

        Assert.Null(response.Profile);
    }
}
