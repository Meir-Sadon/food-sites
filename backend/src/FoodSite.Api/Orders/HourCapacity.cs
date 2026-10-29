using Microsoft.EntityFrameworkCore;
using FoodSite.Api.Data.Entities;

namespace FoodSite.Api.Orders;

/// <summary>
/// The most orders an hour slot takes: <paramref name="Total"/> of any kind, and at most <paramref name="Delivery"/> deliveries and
/// <paramref name="Pickup"/> pickups of them. A null is no limit. With separate limits, the total is the larger of the two
/// (limits 2 and 4: four orders an hour, two of them deliveries); with only the single limit, deliveries and pickups share it.
/// </summary>
public record HourLimits(int? Total, int? Delivery, int? Pickup);

/// <summary>How full an hour slot is: every order in it that is not cancelled counts, whatever its other state.</summary>
public static class HourCapacity
{
    public static IQueryable<Order> InSlot(this IQueryable<Order> orders, DateOnly date, TimeOnly hour) =>
        orders.Where(o => o.SupplyDate == date && o.DeliveryHour == hour && o.Status != OrderStatus.Cancelled);

    /// <summary>Whether delivery and pickup have limits of their own instead of the single one.</summary>
    public static bool HasSeparateLimits(Settings settings) => settings.OrdersPerHourDelivery is not null || settings.OrdersPerHourPickup is not null;

    public static HourLimits LimitsOf(Settings settings) =>
        HasSeparateLimits(settings)
            ? new HourLimits(
                settings.OrdersPerHourDelivery is { } d && settings.OrdersPerHourPickup is { } p ? Math.Max(d, p) : null,
                settings.OrdersPerHourDelivery,
                settings.OrdersPerHourPickup)
            : new HourLimits(settings.OrdersPerHour, null, null);

    /// <summary>Whether the slot has no room left for one more order of <paramref name="method"/>, given the orders already in it.</summary>
    public static bool IsFull(HourLimits limits, FulfillmentMethod method, int deliveries, int pickups)
    {
        if (limits.Total is { } total && deliveries + pickups >= total)
            return true;
        return method == FulfillmentMethod.Delivery
            ? limits.Delivery is { } d && deliveries >= d
            : limits.Pickup is { } p && pickups >= p;
    }

    /// <summary>The orders of a slot by way of receiving.</summary>
    public static async Task<(int Deliveries, int Pickups)> CountAsync(IQueryable<Order> orders, DateOnly date, TimeOnly hour, CancellationToken ct = default)
    {
        var counts = await orders.InSlot(date, hour).GroupBy(o => o.FulfillmentMethod).Select(g => new { Method = g.Key, Count = g.Count() }).ToListAsync(ct);
        return (counts.Where(c => c.Method == FulfillmentMethod.Delivery).Sum(c => c.Count), counts.Where(c => c.Method != FulfillmentMethod.Delivery).Sum(c => c.Count));
    }
}
