namespace FoodSite.Api.Data.Entities;

/// <summary>
/// One change an admin made (or an admin login), written by <see cref="Audit.AuditTrail"/>. Entries are only ever
/// added: no endpoint edits or removes them.
/// </summary>
public class AuditEntry
{
    public const int EntityTypeMaxLength = 50;
    public const int LabelMaxLength = 200;

    public long Id { get; set; }
    public DateTimeOffset At { get; set; }

    /// <summary>Who did it: a name from <see cref="Auth.AdminActor"/>.</summary>
    public required string Actor { get; set; }

    public AuditAction Action { get; set; }

    /// <summary>The entity class name (Dish, Order, Settings...); empty for a login.</summary>
    public string? EntityType { get; set; }

    /// <summary>The entity's key, e.g. "12", or "3,7" for a two-part key.</summary>
    public string? EntityId { get; set; }

    /// <summary>A name to show for the entity (a dish's name, "#12 Dana" for an order), as it was at the time.</summary>
    public string? Label { get; set; }

    /// <summary>JSON array of <see cref="Audit.AuditChange"/>: the fields that changed, before and after.</summary>
    public string? Changes { get; set; }
}

public enum AuditAction
{
    Added,
    Modified,
    Deleted,
    LoggedIn,
}
