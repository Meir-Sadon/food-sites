using System.Net.Http.Json;
using FoodSite.Api.Auth;
using FoodSite.Api.Data;
using FoodSite.Api.Http;
using FoodSite.Api.Images;
using FoodSite.Api.Messaging;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace FoodSite.Api.Tests;

public sealed class ApiFactory : WebApplicationFactory<Program>
{
    public const string AdminPassword = "correct-horse-battery";
    public const string JwtSecret = "test-secret-test-secret-test-secret-123";
    public const string SiteId = "test-site";
    public const string SiteName = "המטבח של הבדיקות";
    public const string ServiceCity = "אשקלון";

    private readonly string _connectionString;
    private readonly Dictionary<string, string?> _settings;

    public ApiFactory(PostgresFixture postgres, Dictionary<string, string?>? overrides = null)
    {
        _connectionString = postgres.ConnectionStringFor("foodsite_" + Guid.NewGuid().ToString("N"));
        _settings = new Dictionary<string, string?>
        {
            ["ConnectionStrings:Default"] = _connectionString,
            ["Jwt:Secret"] = JwtSecret,
            ["Admin:PasswordHash"] = AdminPasswordHasher.Hash(AdminPassword),
            ["Admin:LoginAttemptsPerMinute"] = "1000",
            ["Public:RequestsPerMinute"] = "1000",
            ["Database:MigrateOnStartup"] = "true",
            // No site folder: tests start from an empty catalog, and DatabaseTests covers seeding directly.
            ["Site:Id"] = SiteId,
            ["Site:Name"] = SiteName,
            ["Site:ServiceCities"] = ServiceCity,
            // Every feature on, as in the sites today; FeatureFlagsTests turns them off.
            ["Site:Features:recommendations"] = "true",
            ["Site:Features:favorites"] = "true",
        };
        foreach (var (key, value) in overrides ?? [])
            _settings[key] = value;
    }

    /// <summary>Stands in for Cloudinary in every test.</summary>
    public FakeImageStore Images { get; } = new();

    /// <summary>Records every WhatsApp message instead of sending it.</summary>
    public CapturingWhatsAppSender WhatsApp { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        foreach (var (key, value) in _settings)
            builder.UseSetting(key, value);
        builder.ConfigureTestServices(services =>
        {
            services.AddSingleton<IImageStore>(Images);
            services.AddSingleton<IWhatsAppSender>(WhatsApp);
        });
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

    /// <summary>
    /// Also closes the pooled connections to this factory's database. Every factory has its own database,
    /// so its Npgsql pool would otherwise keep idle connections open until PostgreSQL runs out of them.
    /// </summary>
    public override async ValueTask DisposeAsync()
    {
        await base.DisposeAsync();
        using var connection = new NpgsqlConnection(_connectionString);
        NpgsqlConnection.ClearPool(connection);
    }

    public AppDbContext CreateDbContext()
    {
        var scope = Services.CreateScope();
        return scope.ServiceProvider.GetRequiredService<AppDbContext>();
    }
}
