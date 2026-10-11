namespace FoodSite.Api.Data.Entities;

/// <summary>What a device did on the client site, counted once per device per day.</summary>
public enum UsageEventKind
{
    /// <summary>Opened the site.</summary>
    Visit,
    /// <summary>Put the first dish in an order.</summary>
    OrderStarted,
    /// <summary>Sent an order.</summary>
    OrderSubmitted,
}

/// <summary>
/// One device's activity of one kind on one day (in the site's time zone). The device id is a random
/// value the browser made up; no IP address, browser or person is stored. Pruned after
/// <c>Usage:RawEventDays</c>, once <see cref="UsageDay"/> holds the day's count.
/// </summary>
public class UsageEvent
{
    public const int DeviceIdMaxLength = 64;

    public long Id { get; set; }
    public required string DeviceId { get; set; }
    public UsageEventKind Kind { get; set; }
    public DateOnly Day { get; set; }
}

/// <summary>How many devices did something of one kind on one day: what is kept once the day's events are pruned.</summary>
public class UsageDay
{
    public DateOnly Day { get; set; }
    public UsageEventKind Kind { get; set; }
    public int Devices { get; set; }
}

/// <summary>A device the site has seen, so it is counted once in the total and as new only on its first day.</summary>
public class UsageDevice
{
    public required string Id { get; set; }
    public DateOnly FirstSeen { get; set; }
    public DateOnly LastSeen { get; set; }
}
