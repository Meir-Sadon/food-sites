namespace FoodSite.Api.Social;

/// <summary>The kinds of social link and how an address the admin typed is checked and tidied.</summary>
public static class SocialLinks
{
    public const string Facebook = "facebook";
    public const string Instagram = "instagram";
    public const string TikTok = "tiktok";
    public const string Custom = "custom";

    /// <summary>The platforms with an icon of their own, shown first and in this order; at most one link each.</summary>
    public static readonly IReadOnlyList<string> Platforms = [Facebook, Instagram, TikTok];

    public static readonly IReadOnlyList<string> Kinds = [.. Platforms, Custom];

    public const int MaxCustom = 10;

    public static bool IsKnown(string? kind) => kind is not null && Kinds.Contains(kind);

    /// <summary>
    /// The address as an absolute https URL, or null when it is not one. A missing scheme is filled in as https
    /// ("instagram.com/shop"); any other scheme (http, javascript, ...) is refused.
    /// </summary>
    public static string? NormalizeUrl(string? value)
    {
        var text = value?.Trim();
        if (string.IsNullOrEmpty(text) || text.Any(char.IsWhiteSpace))
            return null;
        if (!text.Contains("://"))
            text = "https://" + text;
        if (!Uri.TryCreate(text, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps
            || string.IsNullOrEmpty(uri.Host) || !uri.Host.Contains('.') || !string.IsNullOrEmpty(uri.UserInfo))
            return null;
        return uri.AbsoluteUri;
    }
}
