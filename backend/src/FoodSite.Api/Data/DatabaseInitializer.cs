using FoodSite.Api.Auth;
using FoodSite.Api.Sites;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace FoodSite.Api.Data;

public static class DatabaseInitializer
{
    /// <summary>
    /// Applies pending migrations and seeds the admin password hash from configuration, and the site's
    /// menu seed files (<c>site.json</c> → <c>seed</c>) when <paramref name="applySeeds"/> is set and migrations ran.
    /// </summary>
    public static async Task InitializeAsync(IServiceProvider services, bool migrate, bool applySeeds = true)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var admin = scope.ServiceProvider.GetRequiredService<IOptions<AdminOptions>>().Value;
        var site = scope.ServiceProvider.GetRequiredService<IOptions<SiteOptions>>().Value;
        var contentRoot = scope.ServiceProvider.GetRequiredService<IWebHostEnvironment>().ContentRootPath;
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger(nameof(DatabaseInitializer));

        if (migrate)
            await db.Database.MigrateAsync();

        await SeedAdminPasswordAsync(db, admin.PasswordHash, logger);
        await SeedServiceCitiesAsync(db, site.ServiceCities, logger);

        if (!migrate || !applySeeds || site.Seed.Count == 0)
            return;
        if (string.IsNullOrWhiteSpace(site.Directory))
            throw new InvalidOperationException("site.json lists seed files but Site:Directory is not set.");
        var directory = Path.GetFullPath(site.Directory, contentRoot);
        foreach (var file in site.Seed)
            await ApplySeedAsync(db, MenuSeed.Load(Path.Combine(directory, file)), logger);
    }

    /// <summary>
    /// Adds the seed's categories and dishes. A category is matched by name and created when missing; a dish
    /// that already exists in its category (removed ones included) is left alone, so this is safe to run on
    /// every start and never undoes an admin's changes.
    /// </summary>
    public static async Task ApplySeedAsync(AppDbContext db, MenuSeed seed, ILogger logger)
    {
        foreach (var seedCategory in seed.Categories)
        {
            var category = await db.Categories.FirstOrDefaultAsync(c => c.Name == seedCategory.Name);
            if (category is null)
            {
                var nextOrder = await db.Categories.AnyAsync() ? await db.Categories.MaxAsync(c => c.DisplayOrder) + 1 : 0;
                category = new Entities.Category { Name = seedCategory.Name, DisplayOrder = nextOrder };
                db.Categories.Add(category);
            }

            var existing = category.Id == 0
                ? []
                : await db.Dishes.Where(d => d.CategoryId == category.Id).Select(d => d.Name).ToListAsync();

            var added = 0;
            foreach (var dish in seedCategory.Dishes.Where(d => !existing.Contains(d.Name)))
            {
                category.Dishes.Add(new Entities.Dish
                {
                    Name = dish.Name,
                    Description = dish.Description,
                    SellBy = dish.SellBy,
                    ChoiceMode = Entities.ChoiceMode.Free,
                    MinAmount = dish.MinAmount,
                    MaxAmount = dish.MaxAmount,
                    AmountStep = dish.AmountStep,
                    UnitPrice = dish.UnitPrice,
                    Images = (dish.Images ?? []).Select((url, i) => new Entities.DishImage
                    {
                        Url = url,
                        // Not in the image store: deleting it there is a harmless no-op.
                        PublicId = "static" + Path.ChangeExtension(url, null),
                        DisplayOrder = i,
                    }).ToList(),
                });
                added++;
            }

            if (added == 0)
                continue;

            await db.SaveChangesAsync();
            logger.LogInformation("Seeded {Count} dishes into the '{Category}' category.", added, seedCategory.Name);
        }
    }

    /// <summary>Copies the site's service cities into Settings once; the admin's value wins afterwards.</summary>
    public static async Task SeedServiceCitiesAsync(AppDbContext db, string? configured, ILogger logger)
    {
        var settings = await db.Settings.SingleAsync(s => s.Id == Entities.Settings.SingletonId);
        if (settings.ServiceCities is not null || configured is null)
            return;

        settings.ServiceCities = Orders.ServiceArea.Format(Orders.ServiceArea.Parse(configured));
        await db.SaveChangesAsync();
        logger.LogInformation("Service cities seeded from the site: {Cities}", settings.ServiceCities);
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
