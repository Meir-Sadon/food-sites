namespace FoodSite.Api.Orders;

/// <summary>
/// The cities the kitchen delivers to, stored as one comma-separated setting ("Ashkelon, Ashdod").
/// A delivery to any other city waits for the admin. An empty list means every city is served.
/// </summary>
public static class ServiceArea
{
    public const int MaxLength = 500;

    public static IReadOnlyList<string> Parse(string? cities) =>
        (cities ?? "").Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .Distinct(StringComparer.Ordinal).ToList();

    /// <summary>The stored form: trimmed, without empty or repeated entries.</summary>
    public static string Format(IEnumerable<string> cities) => string.Join(", ", cities);

    public static bool Serves(IReadOnlyList<string> cities, string? city) =>
        cities.Count == 0 || cities.Contains(city?.Trim() ?? "", StringComparer.Ordinal);

    /// <summary>"אשקלון", "אשקלון ואשדוד", "אשקלון, אשדוד ושדרות".</summary>
    public static string Describe(IReadOnlyList<string> cities) =>
        cities.Count <= 1 ? string.Join("", cities) : $"{string.Join(", ", cities.Take(cities.Count - 1))} ו{cities[^1]}";
}
