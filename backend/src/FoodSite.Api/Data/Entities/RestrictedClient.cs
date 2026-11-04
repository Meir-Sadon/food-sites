namespace FoodSite.Api.Data.Entities;

/// <summary>
/// A phone the admin marked as restricted: the admin sees a warning on its orders and can ask for payment in advance.
/// Admin-only; the client is never told. Keyed by phone so guest orders are covered too.
/// </summary>
public class RestrictedClient
{
    public int Id { get; set; }
    public required string Phone { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
