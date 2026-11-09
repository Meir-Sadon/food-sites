namespace FoodSite.Api.Data.Entities;

public class Order
{
    public const int DeliveryNoteMaxLength = 300;
    public const int CancelReasonMaxLength = 300;

    public int Id { get; set; }

    /// <summary>Empty for guest orders.</summary>
    public int? UserId { get; set; }
    public User? User { get; set; }

    public required string Phone { get; set; }
    public required string Name { get; set; }
    public required string Address { get; set; }

    public DateOnly SupplyDate { get; set; }

    /// <summary>The start of the hour slot the client asked for; empty when the supply day has no hours.</summary>
    public TimeOnly? DeliveryHour { get; set; }

    /// <summary>The end of that slot (00:00 for a slot ending at midnight); empty on an order without an hour.</summary>
    public TimeOnly? DeliveryHourEnd { get; set; }
    public FulfillmentMethod FulfillmentMethod { get; set; }
    public string? Notes { get; set; }

    public PaymentMethod PaymentMethod { get; set; }
    public bool IsPaid { get; set; }

    /// <summary>Set together with IsPaid: how the order was paid. Empty while it is unpaid.</summary>
    public PaidWith? PaidWith { get; set; }

    /// <summary>The admin's note on the payment (a reference, who paid). Empty while it is unpaid.</summary>
    public string? PaymentComment { get; set; }

    /// <summary>The payment was recorded by the driver (through the driver's link), not by the admin.</summary>
    public bool PaidByDriver { get; set; }

    /// <summary>
    /// A delivery outside the service city: the admin has to approve it. Until then it is not a safe order
    /// and its dishes are not taken out of the quantity left for the supply date.
    /// </summary>
    public bool NeedsReview { get; set; }

    /// <summary>
    /// The order total passed the site's deposit threshold: the order waits, unapproved, until the admin marks the deposit paid.
    /// Admin-only: the client is never told (no message, mail or page reads this).
    /// </summary>
    public bool DepositRequired { get; set; }

    /// <summary>The admin marked the deposit as paid; the order then takes its quantities like any approved order.</summary>
    public bool DepositPaid { get; set; }
    public OrderStatus Status { get; set; } = OrderStatus.New;

    /// <summary>Why the admin cancelled the order; required to cancel, empty while the order is not cancelled.</summary>
    public string? CancelReason { get; set; }

    /// <summary>When the admin cancelled the order; empty while it is not cancelled.</summary>
    public DateTimeOffset? CancelledAt { get; set; }

    /// <summary>What the driver reported at the door, through the driver's link; empty until a report.</summary>
    public DeliveryOutcome? DeliveryOutcome { get; set; }
    public DateTimeOffset? DeliveryReportedAt { get; set; }

    /// <summary>The driver's note on the delivery (left with a neighbour, not home, wrong address).</summary>
    public string? DeliveryNote { get; set; }

    /// <summary>The driver's photo of the order at the door.</summary>
    public string? DeliveryProofUrl { get; set; }
    public string? DeliveryProofPublicId { get; set; }

    /// <summary>The delivery fee worked out from the zones when the order was placed; part of <see cref="Total"/>. Zero when none applied.</summary>
    public decimal DeliveryFee { get; set; }

    /// <summary>What the large-order discount took off the fee when the order was placed (<see cref="DeliveryFee"/> is already reduced). Zero when none applied.</summary>
    public decimal DeliveryDiscount { get; set; }

    /// <summary>The name of the zone the fee came from, as it was then.</summary>
    public string? DeliveryZoneName { get; set; }

    /// <summary>What was added to the dishes so the order reached the site's minimum, when the client agreed to be charged it (part of <see cref="Total"/>). Zero when none.</summary>
    public decimal MinimumTopUp { get; set; }

    /// <summary>The order's total to pay, the delivery fee and any minimum top-up included.</summary>
    public decimal Total { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public List<OrderItem> Items { get; set; } = [];

    /// <summary>The one-time price list discounts this order used up.</summary>
    public List<PriceListDiscountUse> DiscountUses { get; set; } = [];
}
