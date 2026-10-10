namespace FoodSite.Api.Usage;

public class UsageOptions
{
    public const string Section = "Usage";

    /// <summary>How many days each device's events are kept. Older days keep only their daily counts.</summary>
    public int RawEventDays { get; set; } = 90;

    /// <summary>How often the daily counts are written and old events pruned (the report also does it when opened).</summary>
    public int RetentionIntervalHours { get; set; } = 6;
}
