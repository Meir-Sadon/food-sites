using System.Net;
using System.Net.Http.Json;
using Kuskus.Api.Auth;
using Kuskus.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Kuskus.Api.Tests;

[Collection(PostgresCollection.Name)]
public sealed class AdminAuthTests(PostgresFixture postgres) : IDisposable
{
    private const string CookieName = "kuskus_admin";

    private readonly ApiFactory _factory = new(postgres);

    public void Dispose() => _factory.Dispose();

    private HttpClient Client() =>
        _factory.CreateClient(new() { HandleCookies = false, AllowAutoRedirect = false });

    private static Task<HttpResponseMessage> Login(HttpClient client, string password) =>
        client.PostAsJsonAsync("/api/admin/login", new { password });

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
        Assert.Contains("admin", await me.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Token_signed_with_another_key_is_rejected()
    {
        var forged = new AdminTokenService(
            Options.Create(new JwtOptions { Secret = "an-attacker-key-an-attacker-key-1234" }),
            Options.Create(new AdminOptions()),
            TimeProvider.System).CreateToken().Token;

        var response = await Client().SendAsync(MeRequest(forged));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Expired_token_is_rejected()
    {
        var expired = new AdminTokenService(
            Options.Create(new JwtOptions { Secret = ApiFactory.JwtSecret }),
            Options.Create(new AdminOptions { SessionHours = 1 }),
            new FixedTime(DateTimeOffset.UtcNow.AddHours(-2))).CreateToken().Token;

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
        var client = _factory.CreateClient();
        for (var i = 0; i < 3; i++)
        {
            var attempt = await client.PostAsJsonAsync("/api/admin/login", new { password = "guess" + i });
            Assert.Equal(HttpStatusCode.Unauthorized, attempt.StatusCode);
        }

        var blocked = await client.PostAsJsonAsync("/api/admin/login", new { password = ApiFactory.AdminPassword });
        Assert.Equal(HttpStatusCode.TooManyRequests, blocked.StatusCode);
    }
}
