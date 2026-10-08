using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace FoodSite.Api.Tests;

[Collection(PostgresCollection.Name)]
public sealed class DatabaseTests : IDisposable
{
    private readonly ApiFactory _factory;

    public DatabaseTests(PostgresFixture postgres)
    {
        _factory = new ApiFactory(postgres);
        _ = _factory.Server; // starts the app, which applies migrations
    }

    public void Dispose() => _factory.Dispose();

    [Fact]
    public async Task Migration_creates_every_table_in_the_data_model()
    {
        await using var db = _factory.CreateDbContext();
        var tables = await db.Database
            .SqlQueryRaw<string>("""
                SELECT table_name AS "Value" FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name <> '__EFMigrationsHistory'
                """)
            .ToListAsync();

        string[] expected =
        [
            "Settings", "SupplyDays", "ClosedDates", "Categories", "Dishes", "DishImages",
            "DishOptions", "DishAddOns", "Users", "Orders", "OrderItems", "FavoriteOrders",
            "Recommendations", "NotifyPhones", "LoginCodes", "FeatureFlags", "MessageTemplates", "Reviews", "ReviewImages",
        ];
        Assert.Equal(expected.Order(), tables.Order());
    }

    [Fact]
    public async Task Model_has_no_changes_missing_from_migrations()
    {
        await using var db = _factory.CreateDbContext();
        Assert.False(db.Database.HasPendingModelChanges());
        Assert.Empty(await db.Database.GetPendingMigrationsAsync());
    }

    [Fact]
    public async Task Settings_has_a_single_row_with_the_seeded_admin_hash()
    {
        await using var db = _factory.CreateDbContext();
        var settings = await db.Settings.SingleAsync();
        Assert.Equal(Settings.SingletonId, settings.Id);
        Assert.False(string.IsNullOrEmpty(settings.AdminPasswordHash));
    }

    [Fact]
    public async Task Seeding_never_overwrites_an_existing_admin_hash()
    {
        await using var db = _factory.CreateDbContext();
        var before = (await db.Settings.SingleAsync()).AdminPasswordHash;

        await DatabaseInitializer.SeedAdminPasswordAsync(db, "some-other-hash", NullLogger.Instance);

        db.ChangeTracker.Clear();
        Assert.Equal(before, (await db.Settings.SingleAsync()).AdminPasswordHash);
    }

    [Fact]
    public async Task A_menu_seed_is_applied_once_and_never_undoes_admin_changes()
    {
        var seed = new MenuSeed([
            new("שתיה", [
                new("קולה", UnitPrice: 12m, Images: ["/drinks/cola.svg"]),
                new("מים", UnitPrice: 8m),
            ]),
        ]);
        await using var db = _factory.CreateDbContext();

        await DatabaseInitializer.ApplySeedAsync(db, seed, NullLogger.Instance);
        var water = await db.Dishes.SingleAsync(d => d.Name == "מים");
        water.IsHidden = true;
        water.UnitPrice = 9m;
        await db.SaveChangesAsync();
        await DatabaseInitializer.ApplySeedAsync(db, seed, NullLogger.Instance);

        db.ChangeTracker.Clear();
        var category = await db.Categories.Include(c => c.Dishes).ThenInclude(d => d.Images).SingleAsync();
        Assert.Equal("שתיה", category.Name);
        Assert.Equal(2, category.Dishes.Count);
        var cola = category.Dishes.Single(d => d.Name == "קולה");
        Assert.Equal(12m, cola.UnitPrice);
        Assert.Equal("/drinks/cola.svg", Assert.Single(cola.Images).Url);
        var keptWater = category.Dishes.Single(d => d.Name == "מים");
        Assert.True(keptWater.IsHidden);
        Assert.Equal(9m, keptWater.UnitPrice);
    }

    [Fact]
    public async Task Dish_with_options_images_and_add_ons_round_trips()
    {
        await using (var db = _factory.CreateDbContext())
        {
            var category = new Category { Name = "עופות", DisplayOrder = 1 };
            var chicken = new Dish
            {
                Name = "עוף בתנור",
                Category = category,
                SellBy = SellBy.Units,
                ChoiceMode = ChoiceMode.Fixed,
                Options = [new DishOption { Label = "חצי עוף", Amount = 0.5m, Price = 45m, IsDefault = true }],
                Images = [new DishImage { Url = "https://example.com/a.jpg", PublicId = "test-site/dishes/a", DisplayOrder = 0 }],
            };
            var leg = new Dish
            {
                Name = "שוק", Category = category, SellBy = SellBy.Units, ChoiceMode = ChoiceMode.Free,
                MinAmount = 1, MaxAmount = 10, UnitPrice = 10m, IsAddOnOnly = true,
            };
            db.AddRange(chicken, leg);
            await db.SaveChangesAsync();
            db.Add(new DishAddOn { ParentDishId = chicken.Id, AddOnDishId = leg.Id });
            await db.SaveChangesAsync();
        }

        await using (var db = _factory.CreateDbContext())
        {
            var chicken = await db.Dishes
                .Include(d => d.Options).Include(d => d.Images)
                .Include(d => d.AddOns).ThenInclude(a => a.AddOnDish)
                .SingleAsync(d => d.Name == "עוף בתנור");
            Assert.Equal(45m, Assert.Single(chicken.Options).Price);
            Assert.Single(chicken.Images);
            var addOn = Assert.Single(chicken.AddOns).AddOnDish!;
            Assert.Equal("שוק", addOn.Name);
            Assert.True(addOn.IsAddOnOnly);
            Assert.Equal(ChoiceMode.Free, addOn.ChoiceMode);
        }
    }

    [Fact]
    public async Task A_dish_cannot_be_its_own_add_on()
    {
        await using var db = _factory.CreateDbContext();
        var dish = new Dish { Name = "כרעיים", Category = new Category { Name = "x" } };
        db.Add(dish);
        await db.SaveChangesAsync();

        db.Add(new DishAddOn { ParentDishId = dish.Id, AddOnDishId = dish.Id });
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task Order_lines_keep_their_snapshot_and_block_deleting_the_dish()
    {
        await using var db = _factory.CreateDbContext();
        var dish = new Dish { Name = "קוסקוס", Category = new Category { Name = "תוספות" } };
        var order = new Order
        {
            Phone = "0501234567", Name = "לקוח", Address = "רחוב 1", SupplyDate = new DateOnly(2026, 10, 9),
            FulfillmentMethod = FulfillmentMethod.Pickup, PaymentMethod = PaymentMethod.OnDelivery,
            Total = 60m, CreatedAt = DateTimeOffset.UtcNow,
        };
        var main = new OrderItem { Dish = dish, DishName = "קוסקוס", OptionLabel = "1 ק\"ג", Quantity = 1, UnitPrice = 50m, LineTotal = 50m };
        var addOn = new OrderItem { Dish = dish, DishName = "רוטב", Quantity = 1, UnitPrice = 10m, LineTotal = 10m };
        main.AddOnItems.Add(addOn);
        order.Items.AddRange([main, addOn]);
        db.Add(order);
        await db.SaveChangesAsync();

        dish.Name = "קוסקוס חדש";
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        var saved = await db.OrderItems.SingleAsync(i => i.ParentItemId == null);
        Assert.Equal("קוסקוס", saved.DishName);
        Assert.Equal(OrderStatus.New, (await db.Orders.SingleAsync()).Status);
        Assert.Equal(1, await db.OrderItems.CountAsync(i => i.ParentItemId == saved.Id));

        // Dishes are hidden, never deleted; the database refuses to delete one that orders use.
        await Assert.ThrowsAsync<Npgsql.PostgresException>(() => db.Dishes.ExecuteDeleteAsync());
    }

    [Fact]
    public async Task Favorite_order_items_are_stored_as_json()
    {
        await using (var db = _factory.CreateDbContext())
        {
            db.Add(new FavoriteOrder
            {
                Name = "שישי רגיל",
                User = new User { Phone = "0521111111", FullName = "דנה", Address = "הרצל 5" },
                Items =
                [
                    new FavoriteOrderItem
                    {
                        DishId = 7, OptionId = 3, Quantity = 2,
                        AddOns = [new FavoriteOrderAddOn { DishId = 9, Quantity = 1.5m }],
                    },
                ],
            });
            await db.SaveChangesAsync();
        }

        await using (var db = _factory.CreateDbContext())
        {
            var type = await db.Database
                .SqlQueryRaw<string>("""
                    SELECT data_type AS "Value" FROM information_schema.columns
                    WHERE table_name = 'FavoriteOrders' AND column_name = 'Items'
                    """)
                .SingleAsync();
            Assert.Equal("jsonb", type);

            var favorite = await db.FavoriteOrders.SingleAsync();
            var item = Assert.Single(favorite.Items);
            Assert.Equal((7, 3, 2m), (item.DishId, item.OptionId, item.Quantity));
            Assert.Equal(1.5m, Assert.Single(item.AddOns).Quantity);
        }
    }

    [Fact]
    public async Task User_phone_is_unique()
    {
        await using var db = _factory.CreateDbContext();
        db.AddRange(
            new User { Phone = "0549999999", FullName = "א", Address = "ב" },
            new User { Phone = "0549999999", FullName = "ג", Address = "ד" });
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }
}
