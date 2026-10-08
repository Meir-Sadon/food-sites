using System.Text.Json;
using System.Text.Json.Serialization;
using FoodSite.Api.Data.Entities;

namespace FoodSite.Api.Data;

/// <summary>
/// A site's first menu data (<c>sites/&lt;id&gt;/seed/*.json</c>, or one shared by every site in
/// <c>sites/_shared/seed/</c>): categories with their dishes.
/// Pictures are URLs, either absolute or served from the site root (the site's <c>public/</c> folder).
/// <c>AddOnOf</c> names the dishes (from any category, this seed or the database) a dish is offered under as an add-on.
/// </summary>
public record MenuSeed(IReadOnlyList<MenuSeed.SeedCategory> Categories)
{
    public record SeedCategory(string Name, IReadOnlyList<SeedDish> Dishes);

    public record SeedDish(
        string Name,
        string? Description = null,
        SellBy SellBy = SellBy.Units,
        decimal? UnitPrice = null,
        decimal MinAmount = 1,
        decimal MaxAmount = 10,
        decimal AmountStep = 1,
        IReadOnlyList<string>? Images = null,
        string? UnitName = null,
        decimal? MaxPerSupplyDate = null,
        bool IsSideDish = false,
        IReadOnlyList<string>? AddOnOf = null);

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
    };

    public static MenuSeed Load(string path) =>
        JsonSerializer.Deserialize<MenuSeed>(File.ReadAllText(path), Json)
            ?? throw new InvalidDataException($"Seed file '{path}' is empty.");
}
