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
    /// <summary>Whether delivery and pickup have limits of their own instead of the single one.</summary>
    public static bool HasSeparateLimits(Settings settings) => settings.OrdersPerHourDelivery is not null || settings.OrdersPerHourPickup is not null;

    /// <summary>
    /// The limits in force. With separate limits and delivery and pickup cut to different slot lengths, the total is left out:
    /// a total of the larger limit cannot mean the same for an hour of deliveries and a quarter of pickups, so each way is
    /// held to its own limit in its own slot.
    /// </summary>
    public static HourLimits LimitsOf(Settings settings) =>
        HasSeparateLimits(settings)
            ? new HourLimits(
                settings.OrdersPerHourDelivery is { } d && settings.OrdersPerHourPickup is { } p && !SlotTiming.Of(settings).SeparateGrids ? Math.Max(d, p) : null,
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

    /// <summary>An order's place in the day: its way of receiving and its slot (the end is empty on an order saved before slots had one).</summary>
    public record Placed(FulfillmentMethod Method, TimeOnly Hour, TimeOnly? End);

    /// <summary>The time an order's slot covers, in minutes of the day; a slot ending at midnight ends at 1440.</summary>
    public static (int From, int To) Span(Placed o, SlotTiming timing) => Span(o.Hour, o.End, timing.MinutesFor(o.Method == FulfillmentMethod.Delivery));

    public static (int From, int To) Span(TimeOnly hour, TimeOnly? end, int fallbackMinutes)
    {
        var from = hour.Hour * 60 + hour.Minute;
        var to = end is { } e ? e.Hour * 60 + e.Minute : from + fallbackMinutes;
        return (from, to <= from ? (end is null ? from + fallbackMinutes : to + 1440) : to);
    }

    public static bool Overlap((int From, int To) a, (int From, int To) b) => a.From < b.To && b.From < a.To;

    /// <summary>Deliveries and pickups already in the time <paramref name="from"/> to <paramref name="to"/> (a slot of one way can overlap several slots of the other).</summary>
    public static (int Deliveries, int Pickups) Count(IEnumerable<Placed> orders, (int From, int To) window, SlotTiming timing)
    {
        int deliveries = 0, pickups = 0;
        foreach (var o in orders.Where(o => Overlap(Span(o, timing), window)))
            if (o.Method == FulfillmentMethod.Delivery) deliveries++;
            else pickups++;
        return (deliveries, pickups);
    }

    /// <summary>The orders of a slot by way of receiving.</summary>
    public static async Task<(int Deliveries, int Pickups)> CountAsync(
        IQueryable<Order> orders, DateOnly date, (int From, int To) window, SlotTiming timing, CancellationToken ct = default)
    {
        var placed = await orders
            .Where(o => o.SupplyDate == date && o.DeliveryHour != null && o.Status != OrderStatus.Cancelled)
            .Select(o => new Placed(o.FulfillmentMethod, o.DeliveryHour!.Value, o.DeliveryHourEnd))
            .ToListAsync(ct);
        return Count(placed, window, timing);
    }

    /// <summary>The ids of the orders that came when their slot was already full for their way, going by the order they were placed.</summary>
    public static HashSet<int> Overbooked(HourLimits limits, SlotTiming timing, IEnumerable<(int Id, DateOnly Date, Placed Order, DateTimeOffset CreatedAt)> orders)
    {
        var overbooked = new HashSet<int>();
        foreach (var day in orders.GroupBy(o => o.Date))
        {
            var before = new List<Placed>();
            // Every order takes a place, also one that came late, as when the order was placed.
            foreach (var order in day.OrderBy(o => o.CreatedAt).ThenBy(o => o.Id))
            {
                var (deliveries, pickups) = Count(before, Span(order.Order, timing), timing);
                if (IsFull(limits, order.Order.Method, deliveries, pickups))
                    overbooked.Add(order.Id);
                before.Add(order.Order);
            }
        }
        return overbooked;
    }
}
