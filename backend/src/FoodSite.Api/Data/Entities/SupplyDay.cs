namespace FoodSite.Api.Data.Entities;

/// <summary>A weekday on which orders are supplied, and when ordering for it closes.</summary>
public class SupplyDay
{
    public int Id { get; set; }

    public DayOfWeek Weekday { get; set; }
    public bool Enabled { get; set; }

    /// <summary>Weekday on which ordering for this supply day closes (e.g. Wednesday for Friday).</summary>
    public DayOfWeek CutoffDay { get; set; }
    public TimeOnly CutoffTime { get; set; }

    /// <summary>
    /// The hours orders are supplied on this day (delivered or picked up). Both set or both empty; empty means the
    /// client picks no hour. The day is split into one-hour slots from <see cref="DeliveryFrom"/> (see <c>SupplyCalendar.HourSlots</c>).
    /// </summary>
    public TimeOnly? DeliveryFrom { get; set; }
    public TimeOnly? DeliveryTo { get; set; }
}
