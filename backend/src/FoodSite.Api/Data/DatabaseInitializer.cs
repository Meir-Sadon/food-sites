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
        await SeedSiteSettingsAsync(db, site.Settings, logger);

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
    /// every start and never undoes an admin's changes. Add-on links are made only for the dishes added now.
    /// </summary>
    public static async Task ApplySeedAsync(AppDbContext db, MenuSeed seed, ILogger logger)
    {
        var addedAddOns = new List<(Entities.Dish Dish, IReadOnlyList<string> Parents)>();
        var ownAddOns = new List<(Entities.Dish Parent, IReadOnlyList<MenuSeed.SeedAddOn> AddOns)>();
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
            var nextDishOrder = category.Id == 0
                ? 0
                : (await db.Dishes.Where(d => d.CategoryId == category.Id).MaxAsync(d => (int?)d.DisplayOrder) ?? -1) + 1;

            var added = 0;
            foreach (var dish in seedCategory.Dishes.Where(d => !existing.Contains(d.Name)))
            {
                var entity = new Entities.Dish
                {
                    Name = dish.Name,
                    DisplayOrder = nextDishOrder++,
                    Description = dish.Description,
                    SellBy = dish.SellBy,
                    ChoiceMode = dish.Options is { Count: > 0 } ? Entities.ChoiceMode.Fixed : Entities.ChoiceMode.Free,
                    IsAddOnOnly = dish.IsAddOnOnly,
                    AdjustmentOptional = dish.AdjustmentOptional,
                    OptionsTitle = dish.OptionsTitle,
                    ShowOptionDifference = dish.ShowOptionDifference,
                    DietaryTags = Sites.DietaryTags.Clean(dish.DietaryTags),
                    AvailabilityRules = (dish.Availability ?? []).Select(a => new Entities.DishAvailabilityRule
                    {
                        Weekday = a.Weekday,
                        From = a.From,
                        To = a.To,
                    }).ToList(),
                    Options = (dish.Options ?? []).Select(o => new Entities.DishOption
                    {
                        Label = o.Label,
                        Amount = o.Amount,
                        Price = o.Price,
                        IsDefault = o.IsDefault,
                    }).ToList(),
                    AddOnGroups = (dish.AddOnGroups ?? []).Select((g, i) => new Entities.AddOnGroup
                    {
                        Name = g.Name,
                        MaxUnits = g.MaxUnits,
                        DisplayOrder = i,
                    }).ToList(),
                    MinAmount = dish.MinAmount,
                    MaxAmount = dish.MaxAmount,
                    AmountStep = dish.AmountStep,
                    UnitPrice = dish.UnitPrice,
                    UnitName = dish.UnitName,
                    MaxPerSupplyDate = dish.MaxPerSupplyDate,
                    IsSideDish = dish.IsSideDish,
                    Images = (dish.Images ?? []).Select((url, i) => new Entities.DishImage
                    {
                        Url = url,
                        // Not in the image store: deleting it there is a harmless no-op.
                        PublicId = "static" + Path.ChangeExtension(url, null),
                        DisplayOrder = i,
                    }).ToList(),
                    Questions = (dish.Questions ?? []).Select((q, i) => new Entities.DishQuestion
                    {
                        Text = q.Text,
                        Kind = q.Kind,
                        Choices = [.. q.Choices ?? []],
                        IsRequired = q.IsRequired,
                        ShowAsDropdown = q.ShowAsDropdown,
                        DisplayOrder = i,
                    }).ToList(),
                };
                category.Dishes.Add(entity);
                if (dish.AddOns is { Count: > 0 } own)
                    ownAddOns.Add((entity, own));
                if (dish.AddOnOf is { Count: > 0 } parents)
                    addedAddOns.Add((entity, parents));
                added++;
            }

            if (added == 0)
                continue;

            await db.SaveChangesAsync();
            logger.LogInformation("Seeded {Count} dishes into the '{Category}' category.", added, seedCategory.Name);
        }

        if (ownAddOns.Count > 0)
        {
            var addOnNames = ownAddOns.SelectMany(a => a.AddOns).Select(a => a.Dish).Distinct().ToList();
            var addOnsByName = await db.Dishes
                .Where(d => addOnNames.Contains(d.Name) && !d.IsHidden)
                .ToListAsync();
            foreach (var (parent, addOns) in ownAddOns)
            {
                for (var i = 0; i < addOns.Count; i++)
                {
                    var addOn = addOns[i];
                    var target = addOnsByName.FirstOrDefault(d => d.Name == addOn.Dish)
                        ?? throw new InvalidDataException($"Seed dish '{parent.Name}' offers '{addOn.Dish}' as an add-on, which is not a dish.");
                    var group = addOn.Group is null ? null : parent.AddOnGroups.FirstOrDefault(g => g.Name == addOn.Group)
                        ?? throw new InvalidDataException($"Seed dish '{parent.Name}' puts '{addOn.Dish}' in the group '{addOn.Group}', which it does not define.");
                    db.DishAddOns.Add(new Entities.DishAddOn
                    {
                        ParentDishId = parent.Id,
                        AddOnDishId = target.Id,
                        DisplayOrder = i,
                        GroupId = group?.Id,
                        Price = addOn.Price,
                        MaxQuantity = addOn.MaxQuantity,
                        IsCheckbox = addOn.IsCheckbox,
                        IsDefault = addOn.IsDefault,
                    });
                }
            }
            await db.SaveChangesAsync();
        }

        if (addedAddOns.Count == 0)
            return;

        var parentNames = addedAddOns.SelectMany(a => a.Parents).Distinct().ToList();
        var parentsByName = await db.Dishes
            .Where(d => parentNames.Contains(d.Name) && !d.IsHidden && !d.IsAddOnOnly)
            .ToListAsync();
        foreach (var (dish, parents) in addedAddOns)
        {
            foreach (var name in parents)
            {
                var parent = parentsByName.FirstOrDefault(d => d.Name == name)
                    ?? throw new InvalidDataException($"Seed dish '{dish.Name}' is an add-on of '{name}', which is not a dish.");
                db.DishAddOns.Add(new Entities.DishAddOn { ParentDishId = parent.Id, AddOnDishId = dish.Id, LinkedFromAddOn = true });
            }
        }
        await db.SaveChangesAsync();
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

    /// <summary>
    /// Copies the site's starting settings (<c>site.json</c> → <c>settings</c>) into the empty Settings fields, once:
    /// afterwards the admin's values win, cleared ones included.
    /// </summary>
    public static async Task SeedSiteSettingsAsync(AppDbContext db, SiteSettingsDefaults defaults, ILogger logger)
    {
        var settings = await db.Settings.SingleAsync(s => s.Id == Entities.Settings.SingletonId);
        if (settings.SiteDefaultsApplied)
            return;

        static string? Fill(string? current, string? value) => current ?? (string.IsNullOrWhiteSpace(value) ? null : value.Trim());
        settings.ContactName = Fill(settings.ContactName, defaults.ContactName);
        settings.ContactPhone = Fill(settings.ContactPhone, defaults.ContactPhone);
        settings.ContactAddress = Fill(settings.ContactAddress, defaults.ContactAddress);
        settings.ContactEmail = Fill(settings.ContactEmail, defaults.ContactEmail);
        settings.ContactOpeningHours = Fill(settings.ContactOpeningHours, defaults.ContactOpeningHours);
        settings.DeliveryAreaText = Fill(settings.DeliveryAreaText, defaults.DeliveryAreaText);
        settings.DeliveryFeeText = Fill(settings.DeliveryFeeText, defaults.DeliveryFeeText);
        settings.KashrutText = Fill(settings.KashrutText, defaults.KashrutText);
        if (settings.BackgroundImageUrl is null && Fill(null, defaults.BackgroundImageUrl) is { } background)
        {
            // Not in the image store (or not under this site's folder): replacing it never deletes it there.
            settings.BackgroundImageUrl = background;
            settings.BackgroundImagePublicId = null;
        }
        settings.SiteDefaultsApplied = true;
        await db.SaveChangesAsync();
        logger.LogInformation("Site settings defaults applied.");
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
