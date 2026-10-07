using System.Text.Json;
using Microsoft.Extensions.Configuration.Json;
using Microsoft.Extensions.Configuration.Memory;

namespace FoodSite.Api.Sites;

/// <summary>
/// Loads the active site's folder (<c>sites/&lt;id&gt;</c>) into configuration under <c>Site:</c>.
/// The folder is <c>Site:Directory</c> when set, else a <c>site</c> folder next to the app (where the
/// production image puts it). Its values rank above appsettings.json and below everything else,
/// so environment variables still win.
/// </summary>
public static class SiteFolder
{
    public const string FolderName = "site";

    public static void AddTo(ConfigurationManager config, string contentRoot)
    {
        var directory = config[$"{SiteOptions.Section}:Directory"];
        if (string.IsNullOrWhiteSpace(directory))
        {
            var bundled = Path.Combine(contentRoot, FolderName);
            if (!Directory.Exists(bundled))
                return;
            directory = bundled;
        }
        directory = Path.GetFullPath(directory, contentRoot);

        var siteJson = Path.Combine(directory, "site.json");
        if (!File.Exists(siteJson))
            throw new InvalidOperationException($"Site:Directory points to '{directory}', which has no site.json.");

        var values = new ConfigurationBuilder().AddJsonFile(siteJson).Build().AsEnumerable()
            .Where(pair => pair.Value is not null)
            .ToDictionary(pair => $"{SiteOptions.Section}:{pair.Key}", pair => pair.Value);
        values[$"{SiteOptions.Section}:Directory"] = directory;
        if (ReadName(Path.Combine(directory, "i18n", "he.json")) is { } name)
            values[$"{SiteOptions.Section}:Name"] = name;

        var source = new MemoryConfigurationSource { InitialData = values };
        var sources = config.Sources.ToList();
        var appSettings = sources.FindIndex(s => s is JsonConfigurationSource { Path: "appsettings.json" });
        config.Sources.Insert(appSettings + 1, source);
    }

    /// <summary><c>app.name</c> from the site's text overrides, if it sets one.</summary>
    private static string? ReadName(string path)
    {
        if (!File.Exists(path))
            return null;
        using var document = JsonDocument.Parse(File.ReadAllText(path));
        return document.RootElement.TryGetProperty("app", out var app)
            && app.TryGetProperty("name", out var name)
            && name.ValueKind == JsonValueKind.String
                ? name.GetString()
                : null;
    }
}
