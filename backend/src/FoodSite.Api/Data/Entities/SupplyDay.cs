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

    /// <summary>Replaced by <see cref="Hours"/> (its values were copied there); no longer read or written, kept until a later contract migration drops the columns.</summary>
    public TimeOnly? DeliveryFrom { get; set; }
    public TimeOnly? DeliveryTo { get; set; }

    /// <summary>
    /// The working hours on this day (orders are delivered or picked up in them), any number of separate ranges. No
    /// ranges means the client picks no hour. Each range is cut into one-hour slots (see <c>SupplyCalendar.HourSlots</c>).
    /// </summary>
    public List<SupplyDayHours> Hours { get; set; } = [];
}

/// <summary>One range of working hours on a <see cref="SupplyDay"/>, such as 11:00 to 15:00.</summary>
public class SupplyDayHours
{
    public int Id { get; set; }

    public int SupplyDayId { get; set; }
    public SupplyDay? SupplyDay { get; set; }

    public TimeOnly From { get; set; }

    /// <summary>
    /// The end of the range. <c>00:00</c> means midnight, the end of the day (11:00 to 00:00 is 11:00 to 24:00); any
    /// other end must come after <see cref="From"/>.
    /// </summary>
    public TimeOnly To { get; set; }

    /// <summary>The end as a time of day, with midnight as 24 hours.</summary>
    public TimeSpan End => To == TimeOnly.MinValue ? TimeSpan.FromDays(1) : To.ToTimeSpan();

    public bool IsValid => End > From.ToTimeSpan();
}
