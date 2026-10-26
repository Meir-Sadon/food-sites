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
    /// <summary>Google's account id ("sub") once the client signed in with Google; the email alone is never the key.</summary>
    public string? GoogleSub { get; set; }
    public DateOnly? Birthday { get; set; }
    public string? EthnicBackground { get; set; }

    /// <summary>When the client registered. Empty for accounts made before it was recorded.</summary>
    public DateTimeOffset? CreatedAt { get; set; }

    public List<UserAddress> Addresses { get; set; } = [];
    public List<Order> Orders { get; set; } = [];
    public List<FavoriteOrder> FavoriteOrders { get; set; } = [];
    public List<Recommendation> Recommendations { get; set; } = [];
}
