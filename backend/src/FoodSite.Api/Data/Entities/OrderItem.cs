namespace FoodSite.Api.Data.Entities;

/// <summary>
/// One line of an order. Name, option and price are copied at order time,
/// so later dish changes never alter past orders.
/// </summary>
public class OrderItem
{
    public int Id { get; set; }

    public int OrderId { get; set; }
    public Order? Order { get; set; }

    public int DishId { get; set; }
    public Dish? Dish { get; set; }

    /// <summary>Set for add-on lines: the item they were ordered under.</summary>
    public int? ParentItemId { get; set; }
    public OrderItem? ParentItem { get; set; }
    public List<OrderItem> AddOnItems { get; set; } = [];

    public required string DishName { get; set; }
    public string? OptionLabel { get; set; }

    /// <summary>The client's name or remark for this line (e.g. who the dish is for); set on dish lines, not add-ons.</summary>
    public string? Note { get; set; }

    /// <summary>
    /// The client's answers to the dish's questions, copied as text so later question edits don't change them. Null in a line
    /// saved before questions existed.
    /// </summary>
    public List<OrderItemAnswer> Answers { get; set; } = [];

    /// <summary>Unit count, or weight in kilos for free-choice weight dishes.</summary>
    public decimal Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal LineTotal { get; set; }
}

/// <summary>A dish question and the client's answer, both as shown (e.g. "כן", "חריף, בינוני", "25/12/2026").</summary>
public class OrderItemAnswer
{
    public required string Question { get; set; }
    public required string Answer { get; set; }
}
