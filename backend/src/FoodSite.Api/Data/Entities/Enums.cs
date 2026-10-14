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
    /// <summary>Legacy: "Bit / PayBox" before the client picked one. Kept so old orders still read; new orders use Bit or PayBox.</summary>
    Transfer,
    Bit,
    PayBox,
}

public static class PaymentMethods
{
    /// <summary>A payment the client makes by hand to the business's number (Bit, PayBox or the legacy combined choice).</summary>
    public static bool IsTransfer(this PaymentMethod method) =>
        method is PaymentMethod.Transfer or PaymentMethod.Bit or PaymentMethod.PayBox;
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
