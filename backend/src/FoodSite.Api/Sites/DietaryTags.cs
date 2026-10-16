namespace FoodSite.Api.Sites;

/// <summary>
/// The special-diet marks the admin can put on a dish ("ללא גלוטן", "צמחונית", ...). A dish stores the ids; the
/// Hebrew label of each is in <c>he.json</c> (<c>dietaryTags.*</c>). Not a feature flag: a dish has none until the
/// admin ticks some.
/// </summary>
public static class DietaryTags
{
    public static readonly IReadOnlyList<string> All =
    [
        "glutenFree", "vegetarian", "vegan", "parve", "lactoseFree", "sugarFree", "nutFree", "eggFree", "kosherForPassover",
    ];

    public static bool IsKnown(string? tag) => tag is not null && All.Contains(tag);

    /// <summary>The known tags of the list, each once, in the order of <see cref="All"/>.</summary>
    public static List<string> Clean(IEnumerable<string>? tags) =>
        All.Where(a => tags?.Contains(a) == true).ToList();
}
