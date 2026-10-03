using System.Net.Http.Json;
using Kuskus.Api.Auth;
using Kuskus.Api.Data;
using Kuskus.Api.Http;
using Kuskus.Api.Images;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace Kuskus.Api.Tests;

public sealed class ApiFactory : WebApplicationFactory<Program>
{
    public const string AdminPassword = "correct-horse-battery";
    public const string JwtSecret = "test-secret-test-secret-test-secret-123";

    private readonly string _connectionString;
    private readonly Dictionary<string, string?> _settings;

    public ApiFactory(PostgresFixture postgres, Dictionary<string, string?>? overrides = null)
    {
        _connectionString = postgres.ConnectionStringFor("kuskus_" + Guid.NewGuid().ToString("N"));
        _settings = new Dictionary<string, string?>
        {
            ["ConnectionStrings:Default"] = _connectionString,
            ["Jwt:Secret"] = JwtSecret,
            ["Admin:PasswordHash"] = AdminPasswordHasher.Hash(AdminPassword),
            ["Admin:LoginAttemptsPerMinute"] = "1000",
            ["Database:MigrateOnStartup"] = "true",
        };
        foreach (var (key, value) in overrides ?? [])
            _settings[key] = value;
    }

    /// <summary>Stands in for Cloudinary in every test.</summary>
    public FakeImageStore Images { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        foreach (var (key, value) in _settings)
            builder.UseSetting(key, value);
        builder.ConfigureTestServices(services => services.AddSingleton<IImageStore>(Images));
    }

    /// <summary>A client that sends the request header the API requires, without cookies.</summary>
    public HttpClient CreateApiClient()
    {
        var client = CreateClient(new() { HandleCookies = false, AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add(RequireRequestHeaderMiddleware.HeaderName, "1");
        return client;
    }

    /// <summary>A client logged in as the admin.</summary>
    public async Task<HttpClient> CreateAdminClientAsync()
    {
        var client = CreateApiClient();
        var login = await client.PostAsJsonAsync("/api/admin/login", new { password = AdminPassword });
        login.EnsureSuccessStatusCode();
        var cookie = login.Headers.GetValues("Set-Cookie").Single().Split(';')[0];
        client.DefaultRequestHeaders.Add("Cookie", cookie);
        return client;
    }

    public AppDbContext CreateDbContext()
    {
        var scope = Services.CreateScope();
        return scope.ServiceProvider.GetRequiredService<AppDbContext>();
    }
}
