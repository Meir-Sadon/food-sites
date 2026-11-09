namespace FoodSite.Api.Orders;

/// <summary>The address parts a client fills in, and the single line shown to the kitchen.</summary>
public static class AddressFormat
{
    public const int PartMaxLength = 100;

    /// <summary>What the client says the address is: nothing chosen, an apartment building or a private house.</summary>
    public const string Building = "Building";
    public const string PrivateHouse = "PrivateHouse";

    /// <summary>Whether this is a building type the form can send (empty means "not set").</summary>
    public static bool IsBuildingType(string? value) => string.IsNullOrEmpty(value) || value is Building or PrivateHouse;

    /// <summary>The value to keep: a known building type, or empty.</summary>
    public static string CleanBuildingType(string? value) => value is Building or PrivateHouse ? value : "";

    /// <summary>"Herzl 12, apartment 5, building, Haifa"; parts that were left empty are skipped.</summary>
    public static string Compose(string? city, string? street, string? houseNumber, string? apartment, string? buildingType = null)
    {
        var line = string.Join(' ', new[] { street, houseNumber }.Select(p => p?.Trim()).Where(p => !string.IsNullOrEmpty(p)));
        var parts = new List<string>();
        if (line.Length > 0) parts.Add(line);
        if (!string.IsNullOrWhiteSpace(apartment)) parts.Add($"דירה {apartment.Trim()}");
        if (buildingType == Building) parts.Add("בנין");
        else if (buildingType == PrivateHouse) parts.Add("בית פרטי");
        if (!string.IsNullOrWhiteSpace(city)) parts.Add(city.Trim());
        return string.Join(", ", parts);
    }
}
