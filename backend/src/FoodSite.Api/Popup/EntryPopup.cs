using FoodSite.Api.Data.Entities;
using FoodSite.Api.Social;

namespace FoodSite.Api.Popup;

/// <summary>
/// The pop-up windows a client can see on the order page: up to <see cref="MaxPopups"/>, each with its choices, the
/// conditions a visitor must all meet to be shown it, and how the button's address is checked.
/// </summary>
public static class EntryPopup
{
    /// <summary>How many pop-ups the admin can set up (slots 1 to this).</summary>
    public const int MaxPopups = 3;

    public const string Small = "small";
    public const string Medium = "medium";
    public const string Large = "large";
    public static readonly IReadOnlyList<string> Sizes = [Small, Medium, Large];

    /// <summary>Shown again on every page load (the default), or once until the browser tab is closed.</summary>
    public const string Always = "always";
    public const string Session = "session";
    public static readonly IReadOnlyList<string> Frequencies = [Always, Session];

    /// <summary>Opens when the page has loaded (after the delay), or only when the visitor seems about to leave the site.</summary>
    public const string Load = "load";
    public const string Exit = "exit";
    public static readonly IReadOnlyList<string> Triggers = [Load, Exit];

    /// <summary>Condition: whether the visitor is logged in. <see cref="Both"/> is the same as no condition.</summary>
    public const string LoggedIn = "loggedIn";
    public const string LoggedOut = "loggedOut";
    public const string Both = "both";
    public static readonly IReadOnlyList<string> LoginChoices = [LoggedIn, LoggedOut, Both];

    /// <summary>Condition: whether a logged-in client ordered within the site's inactivity period (<c>ClientActivity</c>).</summary>
    public const string Active = "active";
    public const string Inactive = "inactive";
    public static readonly IReadOnlyList<string> ActivityChoices = [Active, Inactive, Both];

    /// <summary>Condition: an order was restored from the draft kept in the browser, or filled from the last or a favorite order.</summary>
    public const string AnySource = "any";
    public const string Draft = "draft";
    public const string Last = "last";
    public const string Favorite = "favorite";
    public static readonly IReadOnlyList<string> OrderSources = [AnySource, Draft, Last, Favorite];

    /// <summary>Seconds before it opens (or, for <c>exit</c>, before leaving is watched for); 0 is at once.</summary>
    public const int MaxDelaySeconds = 120;

    /// <summary>The largest order total (₪) a condition can name.</summary>
    public const decimal MaxTotal = 100_000m;

    public const int TitleMaxLength = 80;
    public const int BodyMaxLength = 600;
    public const int ButtonTextMaxLength = 30;
    public const int ButtonUrlMaxLength = 500;

    /// <summary>
    /// One pop-up as the admin and the client site see it. <c>Login</c>, <c>Activity</c> and <c>OrderSource</c> are null
    /// while their condition is off; <c>OrderTotal</c> turns the total condition on (with <c>MinTotal</c> and <c>MaxTotal</c>
    /// as its limits). A visitor sees the pop-up only when every condition that is on matches.
    /// </summary>
    public record Dto(
        int Slot, bool Enabled, string Size, string Frequency, string Trigger, int DelaySeconds, string? Title, string? Body, string? ImageUrl, string? ButtonText, string? ButtonUrl,
        string? Login, string? Activity, string? OrderSource, bool OrderTotal, decimal? MinTotal, decimal? MaxTotal);

    public static string EffectiveSize(string? value) => value is not null && Sizes.Contains(value) ? value : Medium;

    public static string EffectiveFrequency(string? value) => value is not null && Frequencies.Contains(value) ? value : Always;

    public static string EffectiveTrigger(string? value) => value is not null && Triggers.Contains(value) ? value : Load;

    public static int EffectiveDelay(int? value) => Math.Clamp(value ?? 0, 0, MaxDelaySeconds);

    /// <summary>A choice from <paramref name="allowed"/>, or null (the condition is off) for an empty or unknown one.</summary>
    public static string? EffectiveChoice(string? value, IReadOnlyList<string> allowed) =>
        value is not null && allowed.Contains(value) ? value : null;

    /// <summary>
    /// A button address: an https address (a missing scheme is filled in) or a page of this site ("/about"). Returns null
    /// when it is neither, so <c>javascript:</c> and other schemes never reach a client.
    /// </summary>
    public static string? NormalizeUrl(string? value)
    {
        var text = value?.Trim();
        if (text is { Length: > 1 } && text[0] == '/' && text[1] != '/' && text[1] != '\\' && !text.Any(char.IsWhiteSpace))
            return text;
        return SocialLinks.NormalizeUrl(text);
    }

    public static Dto Of(PopupSlot p) => new(
        p.Slot, p.Enabled, EffectiveSize(p.Size), EffectiveFrequency(p.Frequency),
        EffectiveTrigger(p.Trigger), EffectiveDelay(p.DelaySeconds),
        p.Title, p.Body, p.ImageUrl, p.ButtonText, p.ButtonUrl,
        EffectiveChoice(p.Login, LoginChoices), EffectiveChoice(p.Activity, ActivityChoices), EffectiveChoice(p.OrderSource, OrderSources),
        p.OrderTotal, p.OrderTotal ? p.MinTotal : null, p.OrderTotal ? p.MaxTotal : null);

    /// <summary>The admin's view: every slot, an empty one as a new, turned-off pop-up.</summary>
    public static List<Dto> ForAdmin(IEnumerable<PopupSlot> saved)
    {
        var bySlot = saved.ToDictionary(p => p.Slot);
        return Enumerable.Range(1, MaxPopups).Select(slot => Of(bySlot.GetValueOrDefault(slot) ?? new PopupSlot { Slot = slot })).ToList();
    }

    /// <summary>What the client site gets: the pop-ups that are on and have something to say, in slot order.</summary>
    public static List<Dto> ForClient(IEnumerable<PopupSlot> saved) =>
        saved
            .Where(p => p.Slot is >= 1 and <= MaxPopups && p.Enabled && (!string.IsNullOrWhiteSpace(p.Title) || !string.IsNullOrWhiteSpace(p.Body)))
            .OrderBy(p => p.Slot)
            .Select(Of)
            .ToList();
}
