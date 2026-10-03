namespace Kuskus.Api.Data.Entities;

public class Dish
{
    public const int DescriptionMaxLength = 254;

    public int Id { get; set; }
    public required string Name { get; set; }

    public int CategoryId { get; set; }
    public Category? Category { get; set; }

    public string? Description { get; set; }
    public string? AllergenInfo { get; set; }

    public SellBy SellBy { get; set; }
    public ChoiceMode ChoiceMode { get; set; }

    // Free choice: the client picks an amount in [MinAmount, MaxAmount] at UnitPrice per unit or kilo.
    public decimal? MinAmount { get; set; }
    public decimal? MaxAmount { get; set; }
    public decimal? UnitPrice { get; set; }

    public bool IsAddOnOnly { get; set; }
    public bool IsSoldOut { get; set; }

    /// <summary>Removed dishes are hidden, never deleted, so old orders still display.</summary>
    public bool IsHidden { get; set; }

    public List<DishImage> Images { get; set; } = [];
    public List<DishOption> Options { get; set; } = [];

    /// <summary>Links where this dish is the parent: the add-ons offered under it.</summary>
    public List<DishAddOn> AddOns { get; set; } = [];

    /// <summary>Links where this dish is the add-on: the parents it appears under.</summary>
    public List<DishAddOn> AddOnOf { get; set; } = [];
}
