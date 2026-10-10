using System.Globalization;
using System.Text.Json;
using FoodSite.Api.Auth;
using FoodSite.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;

namespace FoodSite.Api.Audit;

/// <summary>A field that changed. A secret field (a password hash) is recorded without its values.</summary>
public record AuditChange(string Field, string? From, string? To, bool Secret = false);

/// <summary>
/// Who is changing data in this request: the logged-in admin, for requests to the admin API only. Anything else
/// (a client's order, startup seeding) is not audited.
/// </summary>
public class AuditActor(IHttpContextAccessor http)
{
    public string? Current
    {
        get
        {
            var context = http.HttpContext;
            if (context is null || !context.Request.Path.StartsWithSegments("/api/admin"))
                return null;
            var user = context.User;
            if (!user.IsInRole(AdminTokenService.AdminRole))
                return null;
            var actor = user.FindFirst(AdminTokenService.ActorClaim)?.Value;
            return AdminActor.IsKnown(actor) ? actor : null;
        }
    }
}

/// <summary>Turns the changes EF Core is about to save into audit entries.</summary>
public static class AuditTrail
{
    private const int ValueMaxLength = 500;

    /// <summary>Not audited at all: the log itself, and clients' login codes.</summary>
    private static readonly HashSet<Type> SkippedTypes = [typeof(AuditEntry), typeof(LoginCode)];

    /// <summary>
    /// Fields left out of entries: list positions (moving one item renumbers the whole list), image store ids,
    /// review link tokens and bookkeeping flags. An update that changes nothing else writes no entry.
    /// </summary>
    private static readonly HashSet<string> SkippedFields =
        ["DisplayOrder", "PublicId", "BackgroundImagePublicId", "Token", nameof(Settings.SiteDefaultsApplied)];

    /// <summary>Recorded as changed, never with their values.</summary>
    private static readonly HashSet<string> SecretFields = [nameof(Settings.AdminPasswordHash)];

    /// <summary>Properties that name an entity, tried in order.</summary>
    private static readonly string[] LabelFields = ["Name", "Label", "DishName", "Phone", "Date", "Weekday"];

    /// <summary>An entry waiting for its entity to be saved, so an added row's generated key can be read.</summary>
    public sealed class Pending(EntityEntry entry, AuditEntry audit)
    {
        public AuditEntry Complete()
        {
            audit.EntityId ??= KeyOf(entry);
            return audit;
        }
    }

    public static List<Pending> Collect(ChangeTracker tracker, string actor, DateTimeOffset at)
    {
        var pending = new List<Pending>();
        foreach (var entry in tracker.Entries())
        {
            if (entry.State is not (EntityState.Added or EntityState.Modified or EntityState.Deleted)
                || SkippedTypes.Contains(entry.Metadata.ClrType)
                || entry.Metadata.IsOwned())
                continue;

            var changes = Changes(entry);
            if (entry.State == EntityState.Modified && changes.Count == 0)
                continue;

            var audit = new AuditEntry
            {
                At = at,
                Actor = actor,
                Action = entry.State switch
                {
                    EntityState.Added => AuditAction.Added,
                    EntityState.Deleted => AuditAction.Deleted,
                    _ => AuditAction.Modified,
                },
                EntityType = Truncate(entry.Metadata.ClrType.Name, AuditEntry.EntityTypeMaxLength),
                // An added row's key is generated on save; Complete() reads it then.
                EntityId = entry.State == EntityState.Added ? null : KeyOf(entry),
                Label = Truncate(LabelOf(entry), AuditEntry.LabelMaxLength),
                Changes = changes.Count == 0 ? null : JsonSerializer.Serialize(changes, JsonSerializerOptions.Web),
            };
            pending.Add(new Pending(entry, audit));
        }
        return pending;
    }

    private static List<AuditChange> Changes(EntityEntry entry)
    {
        var changes = new List<AuditChange>();
        foreach (var property in entry.Properties)
        {
            var meta = property.Metadata;
            if (meta.IsPrimaryKey() || meta.IsShadowProperty() || SkippedFields.Contains(meta.Name))
                continue;

            var secret = SecretFields.Contains(meta.Name);
            switch (entry.State)
            {
                case EntityState.Added when property.CurrentValue is not null:
                    changes.Add(secret ? new(meta.Name, null, null, true) : new(meta.Name, null, Format(property.CurrentValue)));
                    break;
                case EntityState.Modified when property.IsModified && !Equals(property.OriginalValue, property.CurrentValue):
                    changes.Add(secret
                        ? new(meta.Name, null, null, true)
                        : new(meta.Name, Format(property.OriginalValue), Format(property.CurrentValue)));
                    break;
            }
        }
        return changes;
    }

    /// <summary>The entity's own name, after its parent's when it belongs to one (a dish's option, an order's line).</summary>
    private static string? LabelOf(EntityEntry entry)
    {
        if (entry.Entity is Order order)
            return $"#{order.Id} {order.Name}";

        var own = OwnLabel(entry);
        foreach (var reference in entry.References)
        {
            if (reference.CurrentValue is null || reference.Metadata is not { } nav || nav.IsCollection)
                continue;
            var parent = entry.Context.Entry(reference.CurrentValue);
            var parentLabel = parent.Entity is Order parentOrder ? $"#{parentOrder.Id} {parentOrder.Name}" : OwnLabel(parent);
            if (parentLabel is not null)
                return own is null ? parentLabel : $"{parentLabel} › {own}";
        }
        return own;
    }

    private static string? OwnLabel(EntityEntry entry)
    {
        foreach (var name in LabelFields)
        {
            var property = entry.Metadata.FindProperty(name);
            if (property is null)
                continue;
            var value = entry.State == EntityState.Deleted
                ? entry.Property(name).OriginalValue
                : entry.Property(name).CurrentValue;
            if (Format(value) is { Length: > 0 } text)
                return text;
        }
        return null;
    }

    private static string? KeyOf(EntityEntry entry)
    {
        var key = entry.Metadata.FindPrimaryKey();
        return key is null ? null : string.Join(",", key.Properties.Select(p => Format(entry.Property(p.Name).CurrentValue)));
    }

    private static string? Format(object? value)
    {
        var text = value switch
        {
            null => null,
            DateTimeOffset d => d.ToString("O", CultureInfo.InvariantCulture),
            DateTime d => d.ToString("O", CultureInfo.InvariantCulture),
            DateOnly d => d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            TimeOnly t => t.ToString("HH:mm", CultureInfo.InvariantCulture),
            bool b => b ? "true" : "false",
            IFormattable f => f.ToString(null, CultureInfo.InvariantCulture),
            _ => value.ToString(),
        };
        return Truncate(text, ValueMaxLength);
    }

    private static string? Truncate(string? value, int max) =>
        value is null || value.Length <= max ? value : value[..max];
}
