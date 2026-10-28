namespace FoodSite.Api.Data.Entities;

/// <summary>
/// A logged-in client's order in progress, kept on the server as well as in the browser so it follows the client to
/// another device, and so a price list can be assigned to clients in the middle of an order. One per client; it is
/// removed when the client sends an order or empties it.
/// </summary>
public class SavedCart
{
    /// <summary>The order page's state, as it sends it; the server only keeps it.</summary>
    public const int ContentMaxLength = 50_000;

    public int UserId { get; set; }
    public User? User { get; set; }

    public required string Content { get; set; }

    /// <summary>How many dishes the cart holds, so "in the middle of an order" needs no reading of the content.</summary>
    public int ItemCount { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}
