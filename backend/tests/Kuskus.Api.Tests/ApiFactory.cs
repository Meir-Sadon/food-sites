using Kuskus.Api.Auth;
using Kuskus.Api.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
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

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        foreach (var (key, value) in _settings)
            builder.UseSetting(key, value);
    }

    public AppDbContext CreateDbContext()
    {
        var scope = Services.CreateScope();
        return scope.ServiceProvider.GetRequiredService<AppDbContext>();
    }
}
