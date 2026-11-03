using System.Text.Json;

namespace FoodSite.Api.Mcp;

/// <summary>
/// What the connector explains from: <c>Mcp/knowledge.json</c>, built by <c>scripts/build-mcp-knowledge.mjs</c> from the
/// feature guide (the Hebrew text of each feature), the admin's screens and the Hebrew text of each error code.
/// </summary>
public class McpKnowledge
{
    public record Screen(string Path, string Name, string Section, string? Feature);

    public record GuideSection(string Heading, string Text);

    public record Feature(int Number, string Group, string Title, string Lead, List<GuideSection> Sections);

    private record Document(List<Screen> Screens, Dictionary<string, string> Errors, List<Feature> Features);

    public IReadOnlyList<Screen> Screens { get; }
    public IReadOnlyDictionary<string, string> Errors { get; }
    public IReadOnlyList<Feature> Features { get; }

    public McpKnowledge()
    {
        using var stream = typeof(McpKnowledge).Assembly.GetManifestResourceStream("FoodSite.Api.Mcp.knowledge.json")
            ?? throw new InvalidOperationException("Mcp/knowledge.json is not embedded.");
        var document = JsonSerializer.Deserialize<Document>(stream, JsonSerializerOptions.Web)
            ?? throw new InvalidOperationException("Mcp/knowledge.json is empty.");
        Screens = document.Screens;
        Errors = document.Errors;
        Features = document.Features;
    }

    /// <summary>
    /// The features whose text holds any word of the query, those holding the most words first, then those with the
    /// words in their title or group. Plain substring matching, so a short query finds more.
    /// </summary>
    public IReadOnlyList<Feature> Search(string query)
    {
        var words = query.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (words.Length == 0)
            return [];
        return Features
            .Select(f => (Feature: f, Text: FullText(f), Title: f.Title + " " + f.Group))
            .Select(x => (x.Feature, Hits: words.Count(w => x.Text.Contains(w, StringComparison.OrdinalIgnoreCase)),
                TitleHits: words.Count(w => x.Title.Contains(w, StringComparison.OrdinalIgnoreCase))))
            .Where(x => x.Hits > 0)
            .OrderByDescending(x => x.Hits)
            .ThenByDescending(x => x.TitleHits)
            .Select(x => x.Feature)
            .ToList();
    }

    public static string FullText(Feature f) =>
        string.Join('\n', [f.Group, f.Title, f.Lead, .. f.Sections.Select(s => $"{s.Heading}: {s.Text}")]);
}
