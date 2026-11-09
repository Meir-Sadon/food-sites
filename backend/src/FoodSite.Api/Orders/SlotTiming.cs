using FoodSite.Api.Data.Entities;

namespace FoodSite.Api.Orders;

/// <summary>
/// How a day's working hours are cut into the slots a client picks: the slot length, how finely a pickup time can be picked
/// (finer than the slot length, never coarser), whether slots start on round marks, and how long before a slot starts it stops
/// being offered (apart for delivery and for pickup).
/// </summary>
public record SlotTiming(
    int SlotMinutes = 60, bool Align = false, int DeliveryLeadMinutes = 0, int PickupLeadMinutes = 0, int? PickupSlotMinutes = null)
{
    public static readonly int[] AllowedMinutes = [15, 30, 60];

    public static SlotTiming Of(Settings s)
    {
        var slot = AllowedMinutes.Contains(s.SlotMinutes) ? s.SlotMinutes : 60;
        return new(slot, s.AlignSlots, Math.Max(0, s.DeliveryLeadMinutes), Math.Max(0, s.PickupLeadMinutes),
            s.PickupSlotMinutes is { } p && AllowedMinutes.Contains(p) && p < slot ? p : null);
    }

    public static SlotTiming Default { get; } = new();

    /// <summary>How finely a pickup time is picked.</summary>
    public int PickupMinutes => PickupSlotMinutes is { } p && p < SlotMinutes ? p : SlotMinutes;

    /// <summary>Whether pickup times are finer than the slots of the site, so that pickup gets slots of its own.</summary>
    public bool SeparateGrids => PickupMinutes < SlotMinutes;

    public int MinutesFor(bool delivery) => delivery ? SlotMinutes : PickupMinutes;

    public int LeadMinutes(bool delivery) => delivery ? DeliveryLeadMinutes : PickupLeadMinutes;
}
