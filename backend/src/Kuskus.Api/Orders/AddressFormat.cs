namespace Kuskus.Api.Orders;

/// <summary>The address parts a client fills in, and the single line shown to the kitchen.</summary>
public static class AddressFormat
{
    public const int PartMaxLength = 100;

    /// <summary>The only city the kitchen delivers to; orders to any other city wait for the admin.</summary>
    public const string ServiceCity = "אשקלון";

    public static bool IsServiceCity(string? city) => string.Equals(city?.Trim(), ServiceCity, StringComparison.Ordinal);

    /// <summary>"Herzl 12, apartment 5, Haifa"; parts that were left empty are skipped.</summary>
    public static string Compose(string? city, string? street, string? houseNumber, string? apartment)
    {
        var line = string.Join(' ', new[] { street, houseNumber }.Select(p => p?.Trim()).Where(p => !string.IsNullOrEmpty(p)));
        var parts = new List<string>();
        if (line.Length > 0) parts.Add(line);
        if (!string.IsNullOrWhiteSpace(apartment)) parts.Add($"דירה {apartment.Trim()}");
        if (!string.IsNullOrWhiteSpace(city)) parts.Add(city.Trim());
        return string.Join(", ", parts);
    }
}
