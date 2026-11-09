using FoodSite.Api.Data.Entities;
using FoodSite.Api.Orders;

namespace FoodSite.Api.Tests;

public class HourCapacityTests
{
    private static readonly HourLimits Single = new(3, null, null);
    private static readonly HourLimits Separate = new(4, 2, 4);

    [Fact]
    public void Limits_come_from_the_single_limit_until_a_way_has_its_own()
    {
        Assert.Equal(new HourLimits(null, null, null), HourCapacity.LimitsOf(new Settings()));
        Assert.Equal(Single, HourCapacity.LimitsOf(new Settings { OrdersPerHour = 3 }));
        Assert.Equal(Separate, HourCapacity.LimitsOf(new Settings { OrdersPerHour = 3, OrdersPerHourDelivery = 2, OrdersPerHourPickup = 4 }));
        // A way without a limit has no ceiling, so the hour has none overall.
        Assert.Equal(new HourLimits(null, 2, null), HourCapacity.LimitsOf(new Settings { OrdersPerHourDelivery = 2 }));
    }

    [Fact]
    public void The_single_limit_is_shared_by_both_ways()
    {
        Assert.False(HourCapacity.IsFull(Single, FulfillmentMethod.Delivery, 1, 1));
        Assert.True(HourCapacity.IsFull(Single, FulfillmentMethod.Delivery, 1, 2));
        Assert.True(HourCapacity.IsFull(Single, FulfillmentMethod.Pickup, 3, 0));
    }

    [Fact]
    public void Deliveries_stop_at_their_limit_and_the_hour_stops_at_the_larger_one()
    {
        Assert.False(HourCapacity.IsFull(Separate, FulfillmentMethod.Delivery, 1, 0));
        Assert.True(HourCapacity.IsFull(Separate, FulfillmentMethod.Delivery, 2, 0));
        // Two deliveries leave room for two pickups only.
        Assert.False(HourCapacity.IsFull(Separate, FulfillmentMethod.Pickup, 2, 1));
        Assert.True(HourCapacity.IsFull(Separate, FulfillmentMethod.Pickup, 2, 2));
        Assert.False(HourCapacity.IsFull(Separate, FulfillmentMethod.Pickup, 0, 3));
        Assert.True(HourCapacity.IsFull(Separate, FulfillmentMethod.Pickup, 0, 4));
    }

    [Fact]
    public void A_way_with_no_limit_is_only_held_back_by_the_hour_total()
    {
        var onlyDeliveryLimited = new HourLimits(null, 2, null);
        Assert.False(HourCapacity.IsFull(onlyDeliveryLimited, FulfillmentMethod.Pickup, 2, 50));
        Assert.True(HourCapacity.IsFull(onlyDeliveryLimited, FulfillmentMethod.Delivery, 2, 0));
    }

    [Fact]
    public void Slots_of_different_lengths_are_counted_by_the_time_they_cover()
    {
        var timing = new SlotTiming(60, PickupSlotMinutes: 15);
        var placed = new[]
        {
            new HourCapacity.Placed(FulfillmentMethod.Pickup, new(8, 0), new(8, 15)),
            new HourCapacity.Placed(FulfillmentMethod.Pickup, new(8, 15), new(8, 30)),
            new HourCapacity.Placed(FulfillmentMethod.Delivery, new(8, 0), new(9, 0)),
            new HourCapacity.Placed(FulfillmentMethod.Delivery, new(9, 0), new(10, 0)),
        };
        // The hour from 8:00 holds both pickups and the 8:00 delivery; a quarter holds one pickup and the delivery that covers it.
        Assert.Equal((1, 2), HourCapacity.Count(placed, (480, 540), timing));
        Assert.Equal((1, 1), HourCapacity.Count(placed, (480, 495), timing));
        Assert.Equal((0, 0), HourCapacity.Count(placed, (600, 615), timing));
        // An order saved without an end covers the length its way is cut to today.
        Assert.Equal((0, 1), HourCapacity.Count([new(FulfillmentMethod.Pickup, new(8, 0), null)], (480, 495), timing));
        Assert.Equal((0, 0), HourCapacity.Count([new(FulfillmentMethod.Pickup, new(8, 0), null)], (495, 510), timing));
        // A slot ending at midnight ends at the end of the day.
        Assert.Equal((1, 0), HourCapacity.Count([new(FulfillmentMethod.Delivery, new(23, 0), new(0, 0))], (1425, 1440), timing));
    }

    [Fact]
    public void Separate_lengths_hold_each_way_to_its_own_limit_without_a_total()
    {
        var settings = new Settings { OrdersPerHourDelivery = 2, OrdersPerHourPickup = 4, PickupSlotMinutes = 15 };
        Assert.Equal(new HourLimits(null, 2, 4), HourCapacity.LimitsOf(settings));
        // The same lengths keep the total.
        Assert.Equal(new HourLimits(4, 2, 4), HourCapacity.LimitsOf(new Settings { OrdersPerHourDelivery = 2, OrdersPerHourPickup = 4 }));
        // The single limit still covers everything in the slot.
        Assert.Equal(new HourLimits(3, null, null), HourCapacity.LimitsOf(new Settings { OrdersPerHour = 3, PickupSlotMinutes = 15 }));
    }

    [Fact]
    public void Overbooked_orders_are_found_by_overlap()
    {
        var timing = new SlotTiming(60, PickupSlotMinutes: 15);
        var limits = new HourLimits(null, 1, 1);
        var day = new DateOnly(2026, 11, 10);
        var start = DateTimeOffset.UtcNow;
        var orders = new (int, DateOnly, HourCapacity.Placed, DateTimeOffset)[]
        {
            (1, day, new(FulfillmentMethod.Pickup, new(8, 0), new(8, 15)), start),
            (2, day, new(FulfillmentMethod.Pickup, new(8, 0), new(8, 15)), start.AddMinutes(1)),
            (3, day, new(FulfillmentMethod.Pickup, new(8, 15), new(8, 30)), start.AddMinutes(2)),
            (4, day, new(FulfillmentMethod.Delivery, new(8, 0), new(9, 0)), start.AddMinutes(3)),
            (5, day, new(FulfillmentMethod.Delivery, new(8, 0), new(9, 0)), start.AddMinutes(4)),
        };
        Assert.Equal([2, 5], HourCapacity.Overbooked(limits, timing, orders).Order());
    }
}
