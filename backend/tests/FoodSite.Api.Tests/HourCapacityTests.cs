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
}
