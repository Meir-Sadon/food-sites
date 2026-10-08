using FoodSite.Api.Data.Entities;

namespace FoodSite.Api.Orders;

/// <summary>How full an hour slot is: every order in it that is not cancelled counts, whatever its other state.</summary>
public static class HourCapacity
{
    public static IQueryable<Order> InSlot(this IQueryable<Order> orders, DateOnly date, TimeOnly hour) =>
        orders.Where(o => o.SupplyDate == date && o.DeliveryHour == hour && o.Status != OrderStatus.Cancelled);

    /// <summary>Whether <paramref name="taken"/> orders already fill the slot; never full without a limit.</summary>
    public static bool IsFull(int taken, int? ordersPerHour) => ordersPerHour is { } limit && taken >= limit;
}
