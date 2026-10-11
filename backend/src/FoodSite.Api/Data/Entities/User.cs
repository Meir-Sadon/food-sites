namespace FoodSite.Api.Data.Entities;

public class User
{
    public int Id { get; set; }
    public required string Phone { get; set; }
    public required string FullName { get; set; }
    /// <summary>The address parts below, joined (see <c>AddressFormat</c>); what orders and messages show.</summary>
    public required string Address { get; set; }
    public string City { get; set; } = "";
    public string Street { get; set; } = "";
    public string HouseNumber { get; set; } = "";
    public string Apartment { get; set; } = "";
    public string? Email { get; set; }
    public DateOnly? Birthday { get; set; }
    public string? EthnicBackground { get; set; }

    /// <summary>When the client registered. Empty for accounts made before it was recorded.</summary>
    public DateTimeOffset? CreatedAt { get; set; }

    public List<Order> Orders { get; set; } = [];
    public List<FavoriteOrder> FavoriteOrders { get; set; } = [];
    public List<Recommendation> Recommendations { get; set; } = [];
}
