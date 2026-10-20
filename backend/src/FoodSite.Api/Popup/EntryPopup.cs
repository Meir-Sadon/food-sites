using FoodSite.Api.Data.Entities;
using FoodSite.Api.Social;

namespace FoodSite.Api.Popup;

/// <summary>The pop-up window a client sees when the site opens: its choices and how the button's address is checked.</summary>
public static class EntryPopup
{
    public const string Small = "small";
    public const string Medium = "medium";
    public const string Large = "large";
    public static readonly IReadOnlyList<string> Sizes = [Small, Medium, Large];

    /// <summary>Shown again on every page load (the default), or once until the browser tab is closed.</summary>
    public const string Always = "always";
    public const string Session = "session";
    public static readonly IReadOnlyList<string> Frequencies = [Always, Session];

    public const int TitleMaxLength = 80;
    public const int BodyMaxLength = 600;
    public const int ButtonTextMaxLength = 30;
    public const int ButtonUrlMaxLength = 500;

    public record Dto(
        bool Enabled, string Size, string Frequency, string? Title, string? Body, string? ImageUrl, string? ButtonText, string? ButtonUrl);

    public static string EffectiveSize(string? value) => value is not null && Sizes.Contains(value) ? value : Medium;

    public static string EffectiveFrequency(string? value) => value is not null && Frequencies.Contains(value) ? value : Always;

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

    public static Dto Of(Settings s) => new(
        s.PopupEnabled, EffectiveSize(s.PopupSize), EffectiveFrequency(s.PopupFrequency),
        s.PopupTitle, s.PopupBody, s.PopupImageUrl, s.PopupButtonText, s.PopupButtonUrl);

    /// <summary>What the client site gets: nothing unless the pop-up is on and has something to say.</summary>
    public static Dto? ForClient(Settings s) =>
        s.PopupEnabled && (!string.IsNullOrWhiteSpace(s.PopupTitle) || !string.IsNullOrWhiteSpace(s.PopupBody)) ? Of(s) : null;
}
