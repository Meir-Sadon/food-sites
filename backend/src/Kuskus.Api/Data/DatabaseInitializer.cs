using Kuskus.Api.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Kuskus.Api.Data;

public static class DatabaseInitializer
{
    /// <summary>Applies pending migrations and seeds the admin password hash from configuration.</summary>
    public static async Task InitializeAsync(IServiceProvider services, bool migrate)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var admin = scope.ServiceProvider.GetRequiredService<IOptions<AdminOptions>>().Value;
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger(nameof(DatabaseInitializer));

        if (migrate)
            await db.Database.MigrateAsync();

        await SeedAdminPasswordAsync(db, admin.PasswordHash, logger);
    }

    public static async Task SeedAdminPasswordAsync(AppDbContext db, string? configuredHash, ILogger logger)
    {
        var settings = await db.Settings.SingleAsync(s => s.Id == Entities.Settings.SingletonId);
        if (!string.IsNullOrEmpty(settings.AdminPasswordHash))
            return;

        if (string.IsNullOrEmpty(configuredHash))
        {
            logger.LogWarning("No admin password is set. Set Admin__PasswordHash to enable admin login.");
            return;
        }

        settings.AdminPasswordHash = configuredHash;
        await db.SaveChangesAsync();
        logger.LogInformation("Admin password hash seeded from configuration.");
    }
}
