using FoodSite.Api.Data.Entities;

namespace FoodSite.Api.Orders;

/// <summary>
/// How a day's working hours are cut into the slots a client picks: the slot length (one for both ways of receiving, or a
/// length of its own for delivery and for pickup), whether slots start on round marks, and how long before a slot starts it
/// stops being offered (apart for delivery and for pickup).
/// </summary>
public record SlotTiming(
    int SlotMinutes = 60, bool Align = false, int DeliveryLeadMinutes = 0, int PickupLeadMinutes = 0,
    int? DeliverySlotMinutes = null, int? PickupSlotMinutes = null)
{
    public static readonly int[] AllowedMinutes = [15, 30, 60];

    public static SlotTiming Of(Settings s) => new(
        Valid(s.SlotMinutes) ?? 60, s.AlignSlots, Math.Max(0, s.DeliveryLeadMinutes), Math.Max(0, s.PickupLeadMinutes),
        Valid(s.DeliverySlotMinutes), Valid(s.PickupSlotMinutes));

    private static int? Valid(int? minutes) => minutes is { } m && AllowedMinutes.Contains(m) ? m : null;

    public static SlotTiming Default { get; } = new();

    /// <summary>Length of a delivery slot.</summary>
    public int DeliveryMinutes => DeliverySlotMinutes ?? SlotMinutes;

    /// <summary>Length of a pickup slot.</summary>
    public int PickupMinutes => PickupSlotMinutes ?? SlotMinutes;

    public int MinutesFor(bool delivery) => delivery ? DeliveryMinutes : PickupMinutes;

    /// <summary>Whether the two ways are cut into slots of different lengths, so that they get slots of their own.</summary>
    public bool SeparateGrids => DeliveryMinutes != PickupMinutes;

    public int LeadMinutes(bool delivery) => delivery ? DeliveryLeadMinutes : PickupLeadMinutes;
}
