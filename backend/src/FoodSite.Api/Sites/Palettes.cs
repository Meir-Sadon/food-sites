using System.Text.Json;
using System.Text.RegularExpressions;

namespace FoodSite.Api.Sites;

/// <summary>
/// The client site's colours beyond its own <c>theme.css</c>: a ready-made palette that restyles the whole site at once,
/// and single colours the admin sets over it (custom colours win over the palette). The colour values of the palettes
/// live in the frontend (<c>site/palettes.ts</c>); the API only keeps the choice. A site's default palette is
/// <c>site.json</c> → <c>settings.palette</c>; the admin's choice in <c>Settings.Palette</c> wins over it.
/// </summary>
public static partial class Palettes
{
    /// <summary>The site's own colours from its theme.css: no palette applied.</summary>
    public const string Site = "site";

    public static readonly IReadOnlyList<string> All = [Site, "olive", "berry", "ocean", "sunset", "graphite", "rose"];

    /// <summary>The elements a custom colour can be set for (the frontend's <c>COLOR_KEYS</c>).</summary>
    public static readonly IReadOnlyList<string> ColorKeys =
    [
        "background", "text", "accent", "button", "buttonText", "menu", "menuText",
        "banner", "bannerText", "dishBackground", "dishText", "categoryBackground", "line",
    ];

    public const int MaxLength = 20;
    public const int MaxLineWidth = 4;

    public static bool IsKnown(string? name) => name is not null && All.Contains(name);

    public static bool IsColor(string? value) => value is not null && HexColor().IsMatch(value);

    /// <summary>Marks a colour that is copied from another element: <c>=button</c> means "the same as the buttons".</summary>
    public const string CopyPrefix = "=";

    public static bool IsCopy(string? value) =>
        value is not null && value.StartsWith(CopyPrefix, StringComparison.Ordinal) && ColorKeys.Contains(value[CopyPrefix.Length..]);

    /// <summary>A colour, or a copy of another element's colour.</summary>
    public static bool IsColorOrCopy(string? value) => IsColor(value) || IsCopy(value);

    /// <summary>True when following the copies from any element comes back to it, or to an element copying itself.</summary>
    public static bool HasCopyCycle(IReadOnlyDictionary<string, string> colors)
    {
        foreach (var start in colors.Keys)
        {
            var key = start;
            for (var step = 0; step <= ColorKeys.Count; step++)
            {
                if (!colors.TryGetValue(key, out var value) || !IsCopy(value))
                    break;
                key = value[CopyPrefix.Length..];
                if (key == start || step == ColorKeys.Count)
                    return true;
            }
        }
        return false;
    }

    /// <summary>The palette the site shows: the admin's choice, else the site's default, else <see cref="Site"/>.</summary>
    public static string Effective(string? chosen, string? siteDefault) =>
        IsKnown(chosen) ? chosen! : IsKnown(siteDefault) ? siteDefault! : Site;

    /// <summary>The saved custom colours (empty when none); anything unknown or malformed is dropped.</summary>
    public static IReadOnlyDictionary<string, string> Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return new Dictionary<string, string>();
        try
        {
            var saved = JsonSerializer.Deserialize<Dictionary<string, string>>(json) ?? [];
            var valid = saved.Where(c => ColorKeys.Contains(c.Key) && IsColorOrCopy(c.Value)).ToDictionary(c => c.Key, c => c.Value.ToLowerInvariant());
            return HasCopyCycle(valid) ? new Dictionary<string, string>() : valid;
        }
        catch (JsonException)
        {
            return new Dictionary<string, string>();
        }
    }

    /// <summary>The JSON to save for these (already valid) colours; null when there are none.</summary>
    public static string? Format(IReadOnlyDictionary<string, string> colors) =>
        colors.Count == 0
            ? null
            : JsonSerializer.Serialize(colors.OrderBy(c => c.Key, StringComparer.Ordinal).ToDictionary(c => c.Key, c => c.Value.ToLowerInvariant()));

    [GeneratedRegex("^#[0-9a-fA-F]{6}$")]
    private static partial Regex HexColor();
}
