namespace FoodSite.Api.Push;

/// <summary>
/// Pushover settings of one business (<c>Pushover__AppToken</c>, an application created at pushover.net).
/// Without a token nothing is sent.
/// </summary>
public class PushoverOptions
{
    public const string Section = "Pushover";

    public string? AppToken { get; set; }
    public string BaseUrl { get; set; } = "https://api.pushover.net";

    /// <summary>Emergency priority: the alert repeats every <see cref="RetrySeconds"/> until acknowledged or <see cref="ExpireSeconds"/> pass.</summary>
    public int RetrySeconds { get; set; } = 60;
    public int ExpireSeconds { get; set; } = 3600;

    public bool IsConfigured => !string.IsNullOrWhiteSpace(AppToken);
}

/// <summary>The sounds Pushover offers that suit an order alert. The first one is used when none is chosen.</summary>
public static class PushoverSounds
{
    public static readonly IReadOnlyList<string> All = ["siren", "alien", "persistent", "echo", "updown", "climb", "bugle", "cosmic", "falling", "pushover"];

    public static bool IsKnown(string? sound) => sound is not null && All.Contains(sound);
}
