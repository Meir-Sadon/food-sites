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

public enum OrderStatus
{
    New,
    Confirmed,
    Ready,
    Delivered,
    Cancelled,
}
