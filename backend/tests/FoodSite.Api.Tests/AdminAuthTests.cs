using System.Net;
using System.Net.Http.Json;
using FoodSite.Api.Auth;
using FoodSite.Api.Controllers;
using FoodSite.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace FoodSite.Api.Tests;

[Collection(PostgresCollection.Name)]
public sealed class AdminAuthTests(PostgresFixture postgres) : IDisposable
{
    private const string CookieName = ApiFactory.SiteId + "_admin";

    private readonly ApiFactory _factory = new(postgres);

    public void Dispose() => _factory.Dispose();

    private HttpClient Client() => _factory.CreateApiClient();

    private static Task<HttpResponseMessage> Login(HttpClient client, string password, string? username = ApiFactory.OwnerUsername) =>
        client.PostAsJsonAsync("/api/admin/login", new { username, password });

    private static string SessionCookie(HttpResponseMessage response) =>
        Assert.Single(response.Headers.GetValues("Set-Cookie"), c => c.StartsWith(CookieName + "="));

    private static HttpRequestMessage MeRequest(string? token)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/admin/me");
        if (token is not null)
            request.Headers.Add("Cookie", $"{CookieName}={token}");
        return request;
    }

    private static string TokenFrom(string setCookie) => setCookie.Split(';')[0][(CookieName.Length + 1)..];

    [Fact]
    public async Task Health_endpoint_responds()
    {
        var response = await Client().GetAsync("/api/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Correct_password_sets_a_secure_httponly_session_cookie()
    {
        var response = await Login(Client(), ApiFactory.AdminPassword);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var cookie = SessionCookie(response).ToLowerInvariant();
        Assert.Contains("httponly", cookie);
        Assert.Contains("secure", cookie);
        Assert.Contains("samesite=lax", cookie);
        Assert.Contains("path=/api", cookie);
        Assert.Contains("expires=", cookie);
    }

    [Theory]
    [InlineData("wrong-password")]
    [InlineData("CORRECT-HORSE-BATTERY")]
    public async Task Wrong_password_is_rejected_without_a_cookie(string password)
    {
        var response = await Login(Client(), password);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.False(response.Headers.Contains("Set-Cookie"));
    }

    [Fact]
    public async Task Changes_without_the_request_header_are_refused()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/admin/login",
            new { username = ApiFactory.OwnerUsername, password = ApiFactory.AdminPassword });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("missingRequestHeader", await response.Content.ReadAsStringAsync());
        Assert.False(response.Headers.Contains("Set-Cookie"));
    }

    [Fact]
    public async Task Missing_password_is_a_bad_request()
    {
        var response = await Client().PostAsJsonAsync("/api/admin/login", new { });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Me_requires_a_valid_session()
    {
        var client = Client();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.SendAsync(MeRequest(null))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.SendAsync(MeRequest("not-a-jwt"))).StatusCode);

        var token = TokenFrom(SessionCookie(await Login(client, ApiFactory.AdminPassword)));
        var me = await client.SendAsync(MeRequest(token));
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        var body = await me.Content.ReadFromJsonAsync<AdminAuthController.MeDto>(TestFiles.Json);
        Assert.Equal(new AdminAuthController.MeDto("admin", AdminActor.Owner, ApiFactory.OwnerUsername), body);
    }

    [Fact]
    public async Task Master_logs_in_with_its_own_user_name_and_password()
    {
        var client = Client();
        var response = await Login(client, ApiFactory.MasterPassword, ApiFactory.MasterUsername);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var me = await client.SendAsync(MeRequest(TokenFrom(SessionCookie(response))));
        var body = await me.Content.ReadFromJsonAsync<AdminAuthController.MeDto>(TestFiles.Json);
        Assert.Equal(AdminActor.Master, body!.Actor);
        Assert.Equal(ApiFactory.MasterUsername, body.Username);
    }

    [Theory]
    [InlineData(ApiFactory.MasterUsername, ApiFactory.AdminPassword)]
    [InlineData(ApiFactory.OwnerUsername, ApiFactory.MasterPassword)]
    [InlineData("someone", ApiFactory.AdminPassword)]
    [InlineData(null, ApiFactory.AdminPassword)]
    [InlineData("", ApiFactory.MasterPassword)]
    public async Task Each_password_works_only_with_its_own_user_name(string? username, string password)
    {
        var response = await Login(Client(), password, username);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.False(response.Headers.Contains("Set-Cookie"));
    }

    [Fact]
    public async Task User_names_ignore_case_and_spaces()
    {
        Assert.Equal(HttpStatusCode.NoContent, (await Login(Client(), ApiFactory.MasterPassword, " MASTER ")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Login(Client(), ApiFactory.AdminPassword, "Admin")).StatusCode);
    }

    [Fact]
    public async Task A_session_that_does_not_name_its_admin_is_rejected()
    {
        // A token from before there were two admins: the right key and role, but no actor claim.
        var now = DateTime.UtcNow;
        var token = new Microsoft.IdentityModel.JsonWebTokens.JsonWebTokenHandler().CreateToken(
            new Microsoft.IdentityModel.Tokens.SecurityTokenDescriptor
            {
                Issuer = ApiFactory.SiteId,
                Audience = ApiFactory.SiteId,
                Subject = new System.Security.Claims.ClaimsIdentity(
                    [new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.Role, AdminTokenService.AdminRole)]),
                IssuedAt = now,
                NotBefore = now,
                Expires = now.AddHours(1),
                SigningCredentials = new Microsoft.IdentityModel.Tokens.SigningCredentials(
                    AdminTokenService.SigningKey(ApiFactory.JwtSecret), Microsoft.IdentityModel.Tokens.SecurityAlgorithms.HmacSha256),
            });

        var response = await Client().SendAsync(MeRequest(token));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task The_owner_changing_their_password_does_not_touch_the_master_login()
    {
        var owner = await _factory.CreateAdminClientAsync();
        Assert.Equal(HttpStatusCode.NoContent,
            (await ChangePassword(owner, ApiFactory.AdminPassword, ApiFactory.MasterPassword + "-x")).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent,
            (await Login(Client(), ApiFactory.MasterPassword, ApiFactory.MasterUsername)).StatusCode);
    }

    [Fact]
    public async Task The_master_cannot_change_the_owner_password_as_its_own()
    {
        var master = await _factory.CreateMasterClientAsync();

        var response = await ChangePassword(master, ApiFactory.MasterPassword, "brand-new-password");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Contains("ownerOnly", await response.Content.ReadAsStringAsync());
    }

    private static Task<HttpResponseMessage> ResetOwnerPassword(HttpClient client, string? next) =>
        client.PutAsJsonAsync("/api/admin/owner-password", new { newPassword = next });

    [Fact]
    public async Task The_master_can_set_a_new_owner_password()
    {
        var master = await _factory.CreateMasterClientAsync();

        Assert.Equal(HttpStatusCode.NoContent, (await ResetOwnerPassword(master, "owner-forgot-it")).StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized, (await Login(Client(), ApiFactory.AdminPassword)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Login(Client(), "owner-forgot-it")).StatusCode);
    }

    [Fact]
    public async Task A_new_owner_password_from_the_master_is_validated()
    {
        var master = await _factory.CreateMasterClientAsync();
        await (await ResetOwnerPassword(master, "short")).AssertInvalid("newPassword", "passwordTooShort");
    }

    [Fact]
    public async Task Only_the_master_can_set_the_owner_password_without_the_current_one()
    {
        var owner = await _factory.CreateAdminClientAsync();

        var response = await ResetOwnerPassword(owner, "brand-new-password");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Login(Client(), ApiFactory.AdminPassword)).StatusCode);
    }

    [Fact]
    public async Task Token_signed_with_another_key_is_rejected()
    {
        var forged = new AdminTokenService(
            Options.Create(new JwtOptions { Secret = "an-attacker-key-an-attacker-key-1234" }),
            Options.Create(new AdminOptions()),
            TimeProvider.System).CreateToken(AdminActor.Owner).Token;

        var response = await Client().SendAsync(MeRequest(forged));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Expired_token_is_rejected()
    {
        var expired = new AdminTokenService(
            Options.Create(new JwtOptions { Secret = ApiFactory.JwtSecret }),
            Options.Create(new AdminOptions { SessionHours = 1 }),
            new FixedTime(DateTimeOffset.UtcNow.AddHours(-2))).CreateToken(AdminActor.Owner).Token;

        var response = await Client().SendAsync(MeRequest(expired));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Logout_clears_the_cookie()
    {
        var response = await Client().PostAsync("/api/admin/logout", null);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var cookie = SessionCookie(response).ToLowerInvariant();
        Assert.StartsWith(CookieName + "=;", cookie);
        Assert.Contains("expires=thu, 01 jan 1970", cookie);
    }

    [Fact]
    public async Task Login_fails_when_no_admin_password_is_set()
    {
        await using (var db = _factory.CreateDbContext())
        {
            await db.Settings.ExecuteUpdateAsync(s => s.SetProperty(x => x.AdminPasswordHash, (string?)null));
        }

        var response = await Login(Client(), ApiFactory.AdminPassword);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Password_change_in_settings_takes_effect_immediately()
    {
        await using (var db = _factory.CreateDbContext())
        {
            var settings = await db.Settings.SingleAsync(s => s.Id == Settings.SingletonId);
            settings.AdminPasswordHash = AdminPasswordHasher.Hash("new-password");
            await db.SaveChangesAsync();
        }

        var client = Client();
        Assert.Equal(HttpStatusCode.Unauthorized, (await Login(client, ApiFactory.AdminPassword)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Login(client, "new-password")).StatusCode);
    }

    private static Task<HttpResponseMessage> ChangePassword(HttpClient client, string? current, string? next) =>
        client.PutAsJsonAsync("/api/admin/password", new { currentPassword = current, newPassword = next });

    [Fact]
    public async Task Changing_the_password_requires_an_admin_session()
    {
        var response = await ChangePassword(Client(), ApiFactory.AdminPassword, "brand-new-password");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Admin_can_change_the_password()
    {
        var admin = await _factory.CreateAdminClientAsync();

        var response = await ChangePassword(admin, ApiFactory.AdminPassword, "brand-new-password");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var client = Client();
        Assert.Equal(HttpStatusCode.Unauthorized, (await Login(client, ApiFactory.AdminPassword)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Login(client, "brand-new-password")).StatusCode);
    }

    [Theory]
    [InlineData("wrong-password", "brand-new-password", "currentPassword", "wrongPassword")]
    [InlineData(null, "brand-new-password", "currentPassword", "required")]
    [InlineData(ApiFactory.AdminPassword, null, "newPassword", "required")]
    [InlineData(ApiFactory.AdminPassword, "short", "newPassword", "passwordTooShort")]
    public async Task Invalid_password_change_is_rejected_and_keeps_the_old_password(
        string? current, string? next, string field, string code)
    {
        var admin = await _factory.CreateAdminClientAsync();

        var response = await ChangePassword(admin, current, next);

        await response.AssertInvalid(field, code);
        Assert.Equal(HttpStatusCode.NoContent, (await Login(Client(), ApiFactory.AdminPassword)).StatusCode);
    }

    private sealed class FixedTime(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}

[Collection(PostgresCollection.Name)]
public sealed class AdminLoginRateLimitTests(PostgresFixture postgres) : IDisposable
{
    private readonly ApiFactory _factory = new(postgres, new() { ["Admin:LoginAttemptsPerMinute"] = "3" });

    public void Dispose() => _factory.Dispose();

    [Fact]
    public async Task Too_many_login_attempts_are_throttled()
    {
        var client = _factory.CreateApiClient();
        for (var i = 0; i < 3; i++)
        {
            var attempt = await client.PostAsJsonAsync("/api/admin/login", new { username = "admin", password = "guess" + i });
            Assert.Equal(HttpStatusCode.Unauthorized, attempt.StatusCode);
        }

        var blocked = await client.PostAsJsonAsync("/api/admin/login",
            new { username = ApiFactory.OwnerUsername, password = ApiFactory.AdminPassword });
        Assert.Equal(HttpStatusCode.TooManyRequests, blocked.StatusCode);
    }
}

[Collection(PostgresCollection.Name)]
public sealed class MasterLoginOffTests(PostgresFixture postgres) : IDisposable
{
    private readonly ApiFactory _factory = new(postgres, new() { ["Admin:MasterPasswordHash"] = "" });

    public void Dispose() => _factory.Dispose();

    [Theory]
    [InlineData(ApiFactory.MasterPassword)]
    [InlineData("")]
    public async Task Without_a_master_hash_the_master_cannot_log_in(string password)
    {
        var response = await _factory.CreateApiClient().PostAsJsonAsync("/api/admin/login",
            new { username = ApiFactory.MasterUsername, password });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task The_owner_still_logs_in()
    {
        await _factory.CreateAdminClientAsync();
    }
}
