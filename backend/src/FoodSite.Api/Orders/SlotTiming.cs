using FoodSite.Api.Data.Entities;

namespace FoodSite.Api.Orders;

/// <summary>
/// How a day's working hours are cut into the slots a client picks: the slot length, whether slots start on round
/// marks, and how long before a slot starts it stops being offered (apart for delivery and for pickup).
/// </summary>
public record SlotTiming(int SlotMinutes = 60, bool Align = false, int DeliveryLeadMinutes = 0, int PickupLeadMinutes = 0)
{
    public static readonly int[] AllowedMinutes = [15, 30, 60];

    public static SlotTiming Of(Settings s) => new(
        AllowedMinutes.Contains(s.SlotMinutes) ? s.SlotMinutes : 60, s.AlignSlots, Math.Max(0, s.DeliveryLeadMinutes), Math.Max(0, s.PickupLeadMinutes));

    public static SlotTiming Default { get; } = new();

    public int LeadMinutes(bool delivery) => delivery ? DeliveryLeadMinutes : PickupLeadMinutes;
}
