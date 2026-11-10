using FoodSite.Api.Controllers.Admin;

namespace FoodSite.Api.Orders;

/// <summary>The address parts a client fills in, and the single line shown to the kitchen.</summary>
public static class AddressFormat
{
    public const int PartMaxLength = 100;

    /// <summary>The longest free text for the "Other" place type.</summary>
    public const int OtherMaxLength = 60;

    /// <summary>What the client says the address is: nothing chosen, an apartment building, a private house, an office, or something else they write.</summary>
    public const string Building = "Building";
    public const string PrivateHouse = "PrivateHouse";
    public const string Office = "Office";
    public const string Other = "Other";

    /// <summary>Whether this is a building type the form can send (empty means "not set").</summary>
    public static bool IsBuildingType(string? value) => string.IsNullOrEmpty(value) || value is Building or PrivateHouse or Office or Other;

    /// <summary>The value to keep: a known building type, or empty.</summary>
    public static string CleanBuildingType(string? value) => value is Building or PrivateHouse or Office or Other ? value : "";

    /// <summary>The free text to keep: only for "Other", trimmed, with commas and line breaks turned into spaces (the address line is split at commas); empty for every other type.</summary>
    public static string CleanOther(string? buildingType, string? other) => buildingType == Other ? string.Join(' ', (other ?? "").Split([',', '\n', '\r'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)) : "";

    /// <summary>Checks the place type and, for "Other", its text (required, at most <see cref="OtherMaxLength"/> characters).</summary>
    public static void ValidateBuilding(Errors errors, string? buildingType, string? other, string typeField, string otherField)
    {
        if (!IsBuildingType(buildingType))
            errors.Add(typeField, "invalid");
        else if (buildingType == Other)
            errors.Text(otherField, other, OtherMaxLength, required: true);
    }

    /// <summary>"Herzl 12, apartment 5, building, Haifa"; parts that were left empty are skipped.</summary>
    public static string Compose(string? city, string? street, string? houseNumber, string? apartment, string? buildingType = null, string? buildingOther = null)
    {
        var line = string.Join(' ', new[] { street, houseNumber }.Select(p => p?.Trim()).Where(p => !string.IsNullOrEmpty(p)));
        var parts = new List<string>();
        if (line.Length > 0) parts.Add(line);
        if (!string.IsNullOrWhiteSpace(apartment)) parts.Add($"דירה {apartment.Trim()}");
        if (buildingType == Building) parts.Add("בנין");
        else if (buildingType == PrivateHouse) parts.Add("בית פרטי");
        else if (buildingType == Office) parts.Add("משרד");
        else if (buildingType == Other) parts.Add(string.IsNullOrWhiteSpace(buildingOther) ? "אחר" : $"אחר: {CleanOther(Other, buildingOther)}");
        if (!string.IsNullOrWhiteSpace(city)) parts.Add(city.Trim());
        return string.Join(", ", parts);
    }
}
