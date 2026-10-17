using System.Text.RegularExpressions;

namespace FoodSite.Api.Sites;

/// <summary>
/// The ids of the marketing tools the owner connects in the admin settings. The client site loads a tool's script only
/// when its id is set. Each id is checked against the shape the tool uses, so what is stored can only be an id: the
/// frontend puts it into the tool's script.
/// </summary>
public static partial class Tracking
{
    /// <summary>The ids as the client site and the admin see them; an empty string means the tool is off.</summary>
    public record Ids(string MetaPixelId, string GoogleAnalyticsId, string GoogleTagManagerId, string TikTokPixelId)
    {
        public static readonly Ids None = new("", "", "", "");
    }

    /// <summary>What the admin sends: a missing id keeps that tool as it is, an empty one turns it off.</summary>
    public record IdsInput(string? MetaPixelId = null, string? GoogleAnalyticsId = null, string? GoogleTagManagerId = null, string? TikTokPixelId = null);

    /// <summary>Meta Pixel: a number of 8 to 20 digits, from Meta Events Manager (not the Facebook page's link).</summary>
    [GeneratedRegex(@"^[0-9]{8,20}$")]
    private static partial Regex MetaPattern();

    /// <summary>Google Analytics 4 measurement id, such as <c>G-ABC123XYZ9</c>.</summary>
    [GeneratedRegex(@"^G-[A-Z0-9]{4,14}$")]
    private static partial Regex AnalyticsPattern();

    /// <summary>Google Tag Manager container id, such as <c>GTM-ABC123</c>.</summary>
    [GeneratedRegex(@"^GTM-[A-Z0-9]{4,10}$")]
    private static partial Regex TagManagerPattern();

    /// <summary>TikTok pixel code, such as <c>C1ABCDEF2GHIJKLMN3OP</c>.</summary>
    [GeneratedRegex(@"^[A-Z0-9]{10,30}$")]
    private static partial Regex TikTokPattern();

    /// <summary>Trims an id the admin typed or pasted; Google and TikTok ids are upper case.</summary>
    public static string Normalize(string? value, bool upper) =>
        upper ? (value ?? "").Trim().ToUpperInvariant() : (value ?? "").Trim();

    public static bool IsMeta(string value) => value.Length == 0 || MetaPattern().IsMatch(value);
    public static bool IsAnalytics(string value) => value.Length == 0 || AnalyticsPattern().IsMatch(value);
    public static bool IsTagManager(string value) => value.Length == 0 || TagManagerPattern().IsMatch(value);
    public static bool IsTikTok(string value) => value.Length == 0 || TikTokPattern().IsMatch(value);

    public static Ids Of(Data.Entities.Settings s) =>
        new(s.MetaPixelId ?? "", s.GoogleAnalyticsId ?? "", s.GoogleTagManagerId ?? "", s.TikTokPixelId ?? "");
}
