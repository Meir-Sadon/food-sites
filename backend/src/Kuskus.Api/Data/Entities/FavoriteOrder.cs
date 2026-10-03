namespace Kuskus.Api.Data.Entities;

/// <summary>A named order a user saved. Items are stored as JSON and refer to current dishes.</summary>
public class FavoriteOrder
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public User? User { get; set; }
    public required string Name { get; set; }
    public List<FavoriteOrderItem> Items { get; set; } = [];
}

public class FavoriteOrderItem
{
    public int DishId { get; set; }
    public int? OptionId { get; set; }
    public decimal Quantity { get; set; }
    public List<FavoriteOrderAddOn> AddOns { get; set; } = [];
}

public class FavoriteOrderAddOn
{
    public int DishId { get; set; }
    public int? OptionId { get; set; }
    public decimal Quantity { get; set; }
}
