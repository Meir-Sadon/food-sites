namespace FoodSite.Api.Data.Entities;

public class Dish
{
    public const int NameMaxLength = 100;
    public const int DescriptionMaxLength = 254;
    public const int MaxImages = 6;
    public const int UnitNameMaxLength = 30;

    public int Id { get; set; }
    public required string Name { get; set; }

    public int CategoryId { get; set; }
    public Category? Category { get; set; }

    /// <summary>Where the dish sits in its category, set by the admin; new dishes go last.</summary>
    public int DisplayOrder { get; set; }

    public string? Description { get; set; }
    public string? AllergenInfo { get; set; }

    public SellBy SellBy { get; set; }
    public ChoiceMode ChoiceMode { get; set; }

    // Free choice: the client picks an amount in [MinAmount, MaxAmount] at UnitPrice per unit or kilo.
    public decimal? MinAmount { get; set; }
    public decimal? MaxAmount { get; set; }
    public decimal? UnitPrice { get; set; }

    /// <summary>
    /// Free choice: what one unit of the amount is called, e.g. "מגש של 50". Null shows the default
    /// for SellBy (a unit, or a kilo); SellBy still decides whether amounts are whole numbers.
    /// </summary>
    public string? UnitName { get; set; }

    /// <summary>Free choice: the amount moves in steps of this size, e.g. 0.25 kg.</summary>
    public decimal? AmountStep { get; set; }

    /// <summary>
    /// The most of this dish that can be ordered for one supply date, in the same unit as an
    /// order line's quantity (units, or kilos for free-choice weight dishes). Null means no limit.
    /// </summary>
    public decimal? MaxPerSupplyDate { get; set; }

    public bool IsAddOnOnly { get; set; }
    public bool IsSoldOut { get; set; }

    /// <summary>The order page shows this dish's choices right away, without the client first clicking add.</summary>
    public bool OpenByDefault { get; set; }

    /// <summary>
    /// A side dish (e.g. pita): ordered on its own it counts in the side-dish total of the summary,
    /// ordered under another dish as an add-on it counts as part of that dish and adds nothing.
    /// </summary>
    public bool IsSideDish { get; set; }

    /// <summary>Removed dishes are hidden, never deleted, so old orders still display.</summary>
    public bool IsHidden { get; set; }

    public List<DishImage> Images { get; set; } = [];
    public List<DishOption> Options { get; set; } = [];

    /// <summary>Links where this dish is the parent: the add-ons offered under it.</summary>
    public List<DishAddOn> AddOns { get; set; } = [];

    /// <summary>Links where this dish is the add-on: the parents it appears under.</summary>
    public List<DishAddOn> AddOnOf { get; set; } = [];
}
