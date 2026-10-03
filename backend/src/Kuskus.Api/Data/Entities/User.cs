namespace Kuskus.Api.Data.Entities;

public class User
{
    public int Id { get; set; }
    public required string Phone { get; set; }
    public required string FullName { get; set; }
    public required string Address { get; set; }
    public string? Email { get; set; }
    public DateOnly? Birthday { get; set; }
    public string? EthnicBackground { get; set; }

    public List<Order> Orders { get; set; } = [];
    public List<FavoriteOrder> FavoriteOrders { get; set; } = [];
    public List<Recommendation> Recommendations { get; set; } = [];
}
