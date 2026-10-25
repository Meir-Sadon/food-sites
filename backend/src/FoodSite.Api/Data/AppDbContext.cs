using FoodSite.Api.Audit;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Mail;
using Microsoft.EntityFrameworkCore;

namespace FoodSite.Api.Data;

/// <param name="auditActor">Set in the app (not at design time): changes made by a logged-in admin go to <see cref="AuditEntries"/>.</param>
/// <param name="time">The clock audit entries are stamped with.</param>
/// <param name="digest">Told about the saved changes the business owner is mailed about.</param>
public class AppDbContext(
    DbContextOptions<AppDbContext> options,
    AuditActor? auditActor = null,
    TimeProvider? time = null,
    ChangeDigest? digest = null) : DbContext(options)
{
    public DbSet<Settings> Settings => Set<Settings>();
    public DbSet<SupplyDay> SupplyDays => Set<SupplyDay>();
    public DbSet<SupplyDayHours> SupplyDayHours => Set<SupplyDayHours>();
    public DbSet<ClosedDate> ClosedDates => Set<ClosedDate>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Dish> Dishes => Set<Dish>();
    public DbSet<DishImage> DishImages => Set<DishImage>();
    public DbSet<DishOption> DishOptions => Set<DishOption>();
    public DbSet<DishAddOn> DishAddOns => Set<DishAddOn>();
    public DbSet<AddOnGroup> AddOnGroups => Set<AddOnGroup>();
    public DbSet<DishGroup> DishGroups => Set<DishGroup>();
    public DbSet<DeliveryZone> DeliveryZones => Set<DeliveryZone>();
    public DbSet<SocialLink> SocialLinks => Set<SocialLink>();
    public DbSet<DishGroupDish> DishGroupDishes => Set<DishGroupDish>();
    public DbSet<DishQuestion> DishQuestions => Set<DishQuestion>();
    public DbSet<User> Users => Set<User>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<FavoriteOrder> FavoriteOrders => Set<FavoriteOrder>();
    public DbSet<Recommendation> Recommendations => Set<Recommendation>();
    public DbSet<Feedback> Feedback => Set<Feedback>();
    public DbSet<FeatureFlag> FeatureFlags => Set<FeatureFlag>();
    public DbSet<NotifyPhone> NotifyPhones => Set<NotifyPhone>();
    public DbSet<LoginCode> LoginCodes => Set<LoginCode>();
    public DbSet<MessageTemplate> MessageTemplates => Set<MessageTemplate>();
    public DbSet<Review> Reviews => Set<Review>();
    public DbSet<ReviewImage> ReviewImages => Set<ReviewImage>();
    public DbSet<UsageEvent> UsageEvents => Set<UsageEvent>();
    public DbSet<UsageDay> UsageDays => Set<UsageDay>();
    public DbSet<UsageDevice> UsageDevices => Set<UsageDevice>();
    public DbSet<DriverRoute> DriverRoutes => Set<DriverRoute>();
    public DbSet<DriverRouteStop> DriverRouteStops => Set<DriverRouteStop>();
    public DbSet<AuditEntry> AuditEntries => Set<AuditEntry>();

    /// <summary>
    /// Saves, and when an admin made the changes, writes what changed to the audit trail in the same transaction,
    /// so a change is never saved without its entry.
    /// </summary>
    public override async Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken ct = default)
    {
        var pending = PendingAudit();
        if (pending.Count == 0)
            return await base.SaveChangesAsync(acceptAllChangesOnSuccess, ct);

        await using var transaction = Database.CurrentTransaction is null ? await Database.BeginTransactionAsync(ct) : null;
        var saved = await base.SaveChangesAsync(acceptAllChangesOnSuccess, ct);
        var entries = pending.Select(p => p.Complete()).ToList();
        AuditEntries.AddRange(entries);
        await base.SaveChangesAsync(acceptAllChangesOnSuccess, ct);
        if (transaction is not null)
            await transaction.CommitAsync(ct);
        digest?.Add(entries);
        return saved;
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        var pending = PendingAudit();
        if (pending.Count == 0)
            return base.SaveChanges(acceptAllChangesOnSuccess);

        using var transaction = Database.CurrentTransaction is null ? Database.BeginTransaction() : null;
        var saved = base.SaveChanges(acceptAllChangesOnSuccess);
        var entries = pending.Select(p => p.Complete()).ToList();
        AuditEntries.AddRange(entries);
        base.SaveChanges(acceptAllChangesOnSuccess);
        transaction?.Commit();
        digest?.Add(entries);
        return saved;
    }

    private List<AuditTrail.Pending> PendingAudit() =>
        auditActor?.Current is { } actor
            ? AuditTrail.Collect(ChangeTracker, actor, (time ?? TimeProvider.System).GetUtcNow())
            : [];

    protected override void ConfigureConventions(ModelConfigurationBuilder builder)
    {
        // Enums are stored by name so the database stays readable.
        builder.Properties<SellBy>().HaveConversion<string>();
        builder.Properties<ChoiceMode>().HaveConversion<string>();
        builder.Properties<FulfillmentMethod>().HaveConversion<string>();
        builder.Properties<PaymentMethod>().HaveConversion<string>();
        builder.Properties<PaidWith>().HaveConversion<string>();
        builder.Properties<OrderStatus>().HaveConversion<string>();
        builder.Properties<ReviewStatus>().HaveConversion<string>();
        builder.Properties<UsageEventKind>().HaveConversion<string>();
        builder.Properties<DeliveryOutcome>().HaveConversion<string>();
        builder.Properties<AuditAction>().HaveConversion<string>();
        builder.Properties<QuestionKind>().HaveConversion<string>();
        builder.Properties<FeedbackKind>().HaveConversion<string>();

        // Money in shekels and agorot; amounts that can be weights get grams precision.
        builder.Properties<decimal>().HavePrecision(10, 2);
    }

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<Settings>(e =>
        {
            e.Property(s => s.Id).ValueGeneratedNever();
            e.Property(s => s.MinimumOrderAmount).HasPrecision(10, 2);
            e.Property(s => s.SiteStyle).HasMaxLength(Sites.SiteStyles.MaxLength);
            e.Property(s => s.OpsTokenHash).HasMaxLength(64);
            e.Property(s => s.OrderTotalPosition).HasMaxLength(Sites.OrderLayout.MaxLength);
            e.Property(s => s.OrderFlow).HasMaxLength(Sites.OrderLayout.MaxLength);
            e.Property(s => s.Corners).HasMaxLength(Sites.Corners.MaxLength);
            e.Property(s => s.Palette).HasMaxLength(Sites.Palettes.MaxLength);
            e.Property(s => s.FontPair).HasMaxLength(Sites.Finish.MaxLength);
            e.Property(s => s.ShadowStrength).HasMaxLength(Sites.Finish.MaxLength);
            e.Property(s => s.Spacing).HasMaxLength(Sites.Finish.MaxLength);
            e.Property(s => s.TileGroups).HasMaxLength(Sites.Finish.MaxLength);
            e.HasData(new Settings { Id = Entities.Settings.SingletonId });
        });

        model.Entity<SupplyDay>(e =>
        {
            e.HasIndex(s => s.Weekday).IsUnique();
            e.HasMany(s => s.Hours).WithOne(h => h.SupplyDay).HasForeignKey(h => h.SupplyDayId)
                .OnDelete(DeleteBehavior.Cascade);
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
            e.Property(d => d.OptionsTitle).HasMaxLength(Dish.OptionsTitleMaxLength);
            e.HasOne(d => d.Category).WithMany(c => c.Dishes)
                .HasForeignKey(d => d.CategoryId)
                .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(d => d.MainDish).WithMany(d => d.Variants)
                .HasForeignKey(d => d.MainDishId)
                .OnDelete(DeleteBehavior.Restrict);
            e.ToTable(t => t.HasCheckConstraint(
                "CK_Dishes_NotOwnVariant", "\"MainDishId\" <> \"Id\""));
        });

        model.Entity<Settings>(e =>
        {
            e.Property(s => s.DeliveryFeeAmount).HasPrecision(10, 2);
            e.Property(s => s.DeliveryBaseFee).HasPrecision(10, 2);
            e.Property(s => s.DeliveryDiscountMinOrder).HasPrecision(10, 2);
        });

        model.Entity<DeliveryZone>(e =>
        {
            e.Property(z => z.Name).HasMaxLength(DeliveryZone.NameMaxLength).IsRequired();
            e.Property(z => z.Fee).HasPrecision(10, 2);
            e.Property(z => z.PolygonJson).IsRequired();
        });

        model.Entity<SocialLink>(e =>
        {
            e.Property(l => l.Kind).HasMaxLength(20).IsRequired();
            e.Property(l => l.Label).HasMaxLength(SocialLink.LabelMaxLength);
            e.Property(l => l.Url).HasMaxLength(SocialLink.UrlMaxLength).IsRequired();
        });

        model.Entity<DishGroup>(e =>
        {
            e.Property(g => g.Name).HasMaxLength(DishGroup.NameMaxLength).IsRequired();
        });

        model.Entity<DishGroupDish>(e =>
        {
            e.HasKey(x => new { x.GroupId, x.DishId });
            e.HasOne(x => x.Group).WithMany(g => g.Dishes).HasForeignKey(x => x.GroupId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Dish).WithMany().HasForeignKey(x => x.DishId).OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<AddOnGroup>(e =>
        {
            e.Property(g => g.Name).HasMaxLength(AddOnGroup.NameMaxLength);
            e.HasOne(g => g.Dish).WithMany(d => d.AddOnGroups)
                .HasForeignKey(g => g.DishId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<DishQuestion>(e =>
        {
            e.Property(q => q.Text).HasMaxLength(DishQuestion.TextMaxLength);
            e.Property(q => q.Kind).HasMaxLength(20);
            e.Property(q => q.DefaultAnswer).HasMaxLength(DishQuestion.ChoiceMaxLength);
            e.HasOne(q => q.Dish).WithMany(d => d.Questions)
                .HasForeignKey(q => q.DishId)
                .OnDelete(DeleteBehavior.Cascade);
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
            e.HasKey(a => new { a.ParentDishId, a.AddOnDishId, a.Slot });
            e.HasOne(a => a.ParentDish).WithMany(d => d.AddOns)
                .HasForeignKey(a => a.ParentDishId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(a => a.AddOnDish).WithMany(d => d.AddOnOf)
                .HasForeignKey(a => a.AddOnDishId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(a => a.Group).WithMany(g => g.AddOns)
                .HasForeignKey(a => a.GroupId)
                .OnDelete(DeleteBehavior.SetNull);
            e.Property(a => a.MaxQuantity).HasPrecision(10, 3);
            e.Property(a => a.OverLimitPrice).HasPrecision(10, 2);
            e.Property(a => a.Label).HasMaxLength(DishAddOn.LabelMaxLength);
            e.ToTable(t => t.HasCheckConstraint(
                "CK_DishAddOns_NotSelf", "\"ParentDishId\" <> \"AddOnDishId\""));
        });

        model.Entity<User>(e =>
        {
            e.HasIndex(u => u.Phone).IsUnique();
            e.HasIndex(u => u.GoogleSub).IsUnique().HasFilter("\"GoogleSub\" IS NOT NULL");
        });

        model.Entity<Order>(e =>
        {
            e.HasIndex(o => o.SupplyDate);
            e.Property(o => o.DeliveryNote).HasMaxLength(Order.DeliveryNoteMaxLength);
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
            e.OwnsMany(i => i.Answers, answers => answers.ToJson());
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

        model.Entity<Feedback>(e =>
        {
            e.ToTable("Feedback");
            e.Property(f => f.Kind).HasMaxLength(20);
            e.Property(f => f.Text).HasMaxLength(Entities.Feedback.TextMaxLength);
            e.Property(f => f.Page).HasMaxLength(Entities.Feedback.PageMaxLength);
            e.Property(f => f.Actor).HasMaxLength(20);
            e.HasIndex(f => f.IsHandled);
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

        model.Entity<MessageTemplate>(e =>
        {
            e.Property(t => t.Name).HasMaxLength(MessageTemplate.NameMaxLength);
            e.Property(t => t.Text).HasMaxLength(MessageTemplate.TextMaxLength);
        });

        model.Entity<Review>(e =>
        {
            e.HasIndex(r => r.Token).IsUnique();
            e.HasIndex(r => r.OrderId).IsUnique();
            e.HasIndex(r => r.Status);
            e.Property(r => r.Token).HasMaxLength(Review.TokenLength);
            e.Property(r => r.Name).HasMaxLength(Review.NameMaxLength);
            e.Property(r => r.Comment).HasMaxLength(Review.CommentMaxLength);
            e.HasOne(r => r.Order).WithMany()
                .HasForeignKey(r => r.OrderId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<AuditEntry>(e =>
        {
            e.Property(a => a.Actor).HasMaxLength(20);
            e.Property(a => a.Action).HasMaxLength(20);
            e.Property(a => a.EntityType).HasMaxLength(AuditEntry.EntityTypeMaxLength);
            e.Property(a => a.EntityId).HasMaxLength(100);
            e.Property(a => a.Label).HasMaxLength(AuditEntry.LabelMaxLength);
            e.Property(a => a.Changes).HasColumnType("jsonb");
        });

        model.Entity<ReviewImage>(e =>
        {
            e.HasOne(i => i.Review).WithMany(r => r.Images)
                .HasForeignKey(i => i.ReviewId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<UsageEvent>(e =>
        {
            // One row per device, kind and day: recording the same thing again changes nothing.
            e.HasIndex(u => new { u.Day, u.Kind, u.DeviceId }).IsUnique();
            e.Property(u => u.DeviceId).HasMaxLength(UsageEvent.DeviceIdMaxLength);
            e.Property(u => u.Kind).HasMaxLength(20);
        });

        model.Entity<UsageDay>(e =>
        {
            e.HasKey(u => new { u.Day, u.Kind });
            e.Property(u => u.Kind).HasMaxLength(20);
        });

        model.Entity<UsageDevice>(e =>
        {
            e.Property(u => u.Id).HasMaxLength(UsageEvent.DeviceIdMaxLength);
            e.HasIndex(u => u.FirstSeen);
        });

        model.Entity<DriverRoute>(e =>
        {
            e.HasIndex(r => r.Token).IsUnique();
            e.HasIndex(r => r.SupplyDate);
            e.Property(r => r.Token).HasMaxLength(DriverRoute.TokenLength);
        });

        model.Entity<DriverRouteStop>(e =>
        {
            e.HasIndex(s => new { s.DriverRouteId, s.OrderId }).IsUnique();
            e.HasOne(s => s.DriverRoute).WithMany(r => r.Stops)
                .HasForeignKey(s => s.DriverRouteId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(s => s.Order).WithMany()
                .HasForeignKey(s => s.OrderId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
