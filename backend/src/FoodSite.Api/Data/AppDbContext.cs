using FoodSite.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace FoodSite.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Settings> Settings => Set<Settings>();
    public DbSet<SupplyDay> SupplyDays => Set<SupplyDay>();
    public DbSet<ClosedDate> ClosedDates => Set<ClosedDate>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Dish> Dishes => Set<Dish>();
    public DbSet<DishImage> DishImages => Set<DishImage>();
    public DbSet<DishOption> DishOptions => Set<DishOption>();
    public DbSet<DishAddOn> DishAddOns => Set<DishAddOn>();
    public DbSet<User> Users => Set<User>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<FavoriteOrder> FavoriteOrders => Set<FavoriteOrder>();
    public DbSet<Recommendation> Recommendations => Set<Recommendation>();
    public DbSet<FeatureFlag> FeatureFlags => Set<FeatureFlag>();
    public DbSet<NotifyPhone> NotifyPhones => Set<NotifyPhone>();
    public DbSet<LoginCode> LoginCodes => Set<LoginCode>();

    protected override void ConfigureConventions(ModelConfigurationBuilder builder)
    {
        // Enums are stored by name so the database stays readable.
        builder.Properties<SellBy>().HaveConversion<string>();
        builder.Properties<ChoiceMode>().HaveConversion<string>();
        builder.Properties<FulfillmentMethod>().HaveConversion<string>();
        builder.Properties<PaymentMethod>().HaveConversion<string>();
        builder.Properties<PaidWith>().HaveConversion<string>();
        builder.Properties<OrderStatus>().HaveConversion<string>();

        // Money in shekels and agorot; amounts that can be weights get grams precision.
        builder.Properties<decimal>().HavePrecision(10, 2);
    }

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<Settings>(e =>
        {
            e.Property(s => s.Id).ValueGeneratedNever();
            e.Property(s => s.MinimumOrderAmount).HasPrecision(10, 2);
            e.HasData(new Settings { Id = Entities.Settings.SingletonId });
        });

        model.Entity<SupplyDay>(e =>
        {
            e.HasIndex(s => s.Weekday).IsUnique();
        });

        model.Entity<ClosedDate>(e =>
        {
            e.HasIndex(c => c.Date).IsUnique();
        });

        model.Entity<Category>(e =>
        {
            e.Property(c => c.Name).IsRequired();
        });

        model.Entity<Dish>(e =>
        {
            e.Property(d => d.Description).HasMaxLength(Dish.DescriptionMaxLength);
            e.Property(d => d.MinAmount).HasPrecision(10, 3);
            e.Property(d => d.MaxAmount).HasPrecision(10, 3);
            e.Property(d => d.AmountStep).HasPrecision(10, 3);
            e.Property(d => d.MaxPerSupplyDate).HasPrecision(10, 3);
            e.Property(d => d.Name).HasMaxLength(Dish.NameMaxLength);
            e.Property(d => d.UnitName).HasMaxLength(Dish.UnitNameMaxLength);
            e.HasOne(d => d.Category).WithMany(c => c.Dishes)
                .HasForeignKey(d => d.CategoryId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        model.Entity<DishImage>(e =>
        {
            e.HasOne(i => i.Dish).WithMany(d => d.Images)
                .HasForeignKey(i => i.DishId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<DishOption>(e =>
        {
            e.Property(o => o.Amount).HasPrecision(10, 3);
            e.HasOne(o => o.Dish).WithMany(d => d.Options)
                .HasForeignKey(o => o.DishId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<DishAddOn>(e =>
        {
            e.HasKey(a => new { a.ParentDishId, a.AddOnDishId });
            e.HasOne(a => a.ParentDish).WithMany(d => d.AddOns)
                .HasForeignKey(a => a.ParentDishId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(a => a.AddOnDish).WithMany(d => d.AddOnOf)
                .HasForeignKey(a => a.AddOnDishId)
                .OnDelete(DeleteBehavior.Cascade);
            e.ToTable(t => t.HasCheckConstraint(
                "CK_DishAddOns_NotSelf", "\"ParentDishId\" <> \"AddOnDishId\""));
        });

        model.Entity<User>(e =>
        {
            e.HasIndex(u => u.Phone).IsUnique();
        });

        model.Entity<Order>(e =>
        {
            e.HasIndex(o => o.SupplyDate);
            e.HasOne(o => o.User).WithMany(u => u.Orders)
                .HasForeignKey(o => o.UserId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        model.Entity<OrderItem>(e =>
        {
            e.Property(i => i.Quantity).HasPrecision(10, 3);
            e.HasOne(i => i.Order).WithMany(o => o.Items)
                .HasForeignKey(i => i.OrderId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(i => i.Dish).WithMany()
                .HasForeignKey(i => i.DishId)
                .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(i => i.ParentItem).WithMany(i => i.AddOnItems)
                .HasForeignKey(i => i.ParentItemId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<FavoriteOrder>(e =>
        {
            e.HasOne(f => f.User).WithMany(u => u.FavoriteOrders)
                .HasForeignKey(f => f.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            e.OwnsMany(f => f.Items, items =>
            {
                items.ToJson();
                items.OwnsMany(i => i.AddOns);
            });
        });

        model.Entity<Recommendation>(e =>
        {
            e.HasOne(r => r.User).WithMany(u => u.Recommendations)
                .HasForeignKey(r => r.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<FeatureFlag>(e =>
        {
            e.HasKey(f => f.Name);
        });

        model.Entity<NotifyPhone>(e =>
        {
            e.HasIndex(p => p.Phone).IsUnique();
        });

        model.Entity<LoginCode>(e =>
        {
            e.HasIndex(c => c.Phone);
            e.HasIndex(c => c.ExpiresAt);
        });
    }
}
