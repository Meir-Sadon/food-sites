namespace FoodSite.Api.Data.Entities;

/// <summary>
/// One of a client's saved addresses (home, work...). Exactly one is the default while the client has any; the
/// address columns on <see cref="User"/> mirror the default so older readers keep working.
/// </summary>
public class UserAddress
{
    public const int LabelMaxLength = 40;
    public const int MaxPerUser = 10;

    public int Id { get; set; }
    public int UserId { get; set; }
    public User? User { get; set; }

    /// <summary>A name the client gave it ("home", "work"); empty when none.</summary>
    public string? Label { get; set; }
    public required string City { get; set; }
    public required string Street { get; set; }
    public required string HouseNumber { get; set; }
    public string Apartment { get; set; } = "";

    /// <summary>The parts joined (see <c>AddressFormat</c>); what orders and messages show.</summary>
    public required string Address { get; set; }
    public bool IsDefault { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
