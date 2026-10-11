namespace FoodSite.Api.Data.Entities;

public enum SellBy
{
    Units,
    Weight,
}

public enum ChoiceMode
{
    Fixed,
    Free,
}

public enum FulfillmentMethod
{
    Delivery,
    Pickup,
}

public enum PaymentMethod
{
    OnDelivery,
    Transfer,
}

/// <summary>How a paid order was actually paid. Unknown is for orders marked paid before this was recorded.</summary>
public enum PaidWith
{
    Unknown,
    Cash,
    Bit,
    PayBox,
    BankTransfer,
    CreditCard,
    Other,
}

public enum OrderStatus
{
    New,
    Confirmed,
    Ready,
    Delivered,
    Cancelled,
}

/// <summary>What the driver reported for a delivery.</summary>
public enum DeliveryOutcome
{
    Delivered,
    NotDelivered,
}

/// <summary>Whether a submitted review shows on the home page. New reviews wait for the admin.</summary>
public enum ReviewStatus
{
    Pending,
    Approved,
    Blocked,
}
