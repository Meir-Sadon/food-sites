namespace Kuskus.Api.Data.Entities;

public class Order
{
    public int Id { get; set; }

    /// <summary>Empty for guest orders.</summary>
    public int? UserId { get; set; }
    public User? User { get; set; }

    public required string Phone { get; set; }
    public required string Name { get; set; }
    public required string Address { get; set; }

    public DateOnly SupplyDate { get; set; }
    public FulfillmentMethod FulfillmentMethod { get; set; }
    public string? Notes { get; set; }

    public PaymentMethod PaymentMethod { get; set; }
    public bool IsPaid { get; set; }

    /// <summary>
    /// A delivery outside the service city: the admin has to approve it. Until then it is not a safe order
    /// and its dishes are not taken out of the quantity left for the supply date.
    /// </summary>
    public bool NeedsReview { get; set; }
    public OrderStatus Status { get; set; } = OrderStatus.New;

    public decimal Total { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public List<OrderItem> Items { get; set; } = [];
}
