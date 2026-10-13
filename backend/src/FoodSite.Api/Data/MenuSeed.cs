using System.Text.Json;
using System.Text.Json.Serialization;
using FoodSite.Api.Data.Entities;

namespace FoodSite.Api.Data;

/// <summary>
/// A site's first menu data (<c>sites/&lt;id&gt;/seed/*.json</c>, or one shared by every site in
/// <c>sites/_shared/seed/</c>): categories with their dishes.
/// Pictures are URLs, either absolute or served from the site root (the site's <c>public/</c> folder).
/// <c>AddOnOf</c> names the dishes (from any category, this seed or the database) a dish is offered under as an add-on.
/// <c>Options</c> make a fixed-choice dish (<c>OptionsTitle</c> is the heading over them, <c>ShowOptionDifference</c> shows the other options as "+₪X" over the default); <c>AddOns</c> (with <c>AddOnGroups</c>) are the dish's own add-ons, linked once it is added.
/// <c>Questions</c> are asked of the client for each ordered unit, like the ones the admin adds in the dish form.
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
        IReadOnlyList<string>? AddOnOf = null,
        IReadOnlyList<SeedQuestion>? Questions = null,
        IReadOnlyList<SeedOption>? Options = null,
        bool IsAddOnOnly = false,
        IReadOnlyList<SeedAddOnGroup>? AddOnGroups = null,
        IReadOnlyList<SeedAddOn>? AddOns = null,
        string? OptionsTitle = null,
        bool ShowOptionDifference = false);

    /// <summary>A fixed choice of the dish (a size or a weight); with any, the dish is a fixed-choice dish and its amount settings are unused.</summary>
    public record SeedOption(string Label, decimal Price, bool IsDefault = false, decimal Amount = 1);

    /// <summary>A named group of the dish's own add-ons with a limit on the units picked from it (null: no limit).</summary>
    public record SeedAddOnGroup(string Name, int? MaxUnits = null);

    /// <summary>
    /// An add-on this dish offers: the name of another dish (this seed's or the database's), at <c>Price</c> under this dish
    /// (null keeps its own), in the named group, as a check box or up to <c>MaxQuantity</c> per ordered unit.
    /// </summary>
    public record SeedAddOn(string Dish, decimal? Price = null, string? Group = null, bool IsCheckbox = false, decimal? MaxQuantity = null);

    public record SeedQuestion(
        string Text,
        QuestionKind Kind = QuestionKind.SingleChoice,
        IReadOnlyList<string>? Choices = null,
        bool IsRequired = false,
        bool ShowAsDropdown = false);

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
    };

    public static MenuSeed Load(string path) =>
        JsonSerializer.Deserialize<MenuSeed>(File.ReadAllText(path), Json)
            ?? throw new InvalidDataException($"Seed file '{path}' is empty.");
}
