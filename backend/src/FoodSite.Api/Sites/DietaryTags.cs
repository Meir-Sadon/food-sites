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

    /// <summary>The Hebrew name of each tag, as the client picks it and as it is written on the order line.</summary>
    public static readonly IReadOnlyDictionary<string, string> Labels = new Dictionary<string, string>
    {
        ["glutenFree"] = "ללא גלוטן",
        ["vegetarian"] = "צמחונית",
        ["vegan"] = "טבעונית",
        ["parve"] = "פרווה",
        ["lactoseFree"] = "ללא לקטוז",
        ["sugarFree"] = "ללא סוכר",
        ["nutFree"] = "ללא אגוזים",
        ["eggFree"] = "ללא ביצים",
        ["kosherForPassover"] = "כשר לפסח",
    };

    /// <summary>The id of the question a dish with tags asks (never a stored question, so it cannot clash with one).</summary>
    public const int QuestionId = -1;

    public const string QuestionText = "אפשר להזמין את המנה גם בגרסה:";

    public static bool IsKnown(string? tag) => tag is not null && All.Contains(tag);

    /// <summary>The known tags of the list, each once, in the order of <see cref="All"/>.</summary>
    public static List<string> Clean(IEnumerable<string>? tags) =>
        All.Where(a => tags?.Contains(a) == true).ToList();
}
