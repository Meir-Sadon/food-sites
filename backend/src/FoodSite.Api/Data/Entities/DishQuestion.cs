namespace FoodSite.Api.Data.Entities;

/// <summary>How the client answers a dish question.</summary>
public enum QuestionKind
{
    /// <summary>Free text.</summary>
    Text,
    Number,
    Date,
    YesNo,
    /// <summary>One of the admin's choices: radio buttons, or a drop-down list with <see cref="DishQuestion.ShowAsDropdown"/>.</summary>
    SingleChoice,
    /// <summary>Any of the admin's choices (check boxes).</summary>
    MultiChoice,
}

/// <summary>
/// A question the client answers when ordering the dish, e.g. "רמת חריפות" or "מה לכתוב על העוגה?". A variant asks
/// its main dish's questions too. Answers are copied onto the order line (<see cref="OrderItem.Answers"/>).
/// </summary>
public class DishQuestion
{
    public const int TextMaxLength = 100;
    public const int ChoiceMaxLength = 50;
    public const int MaxChoices = 20;
    public const int MaxPerDish = 20;

    public int Id { get; set; }

    public int DishId { get; set; }
    public Dish? Dish { get; set; }

    public required string Text { get; set; }
    public QuestionKind Kind { get; set; }

    /// <summary>The choices for <see cref="QuestionKind.SingleChoice"/> and <see cref="QuestionKind.MultiChoice"/>, in order.</summary>
    public List<string> Choices { get; set; } = [];

    /// <summary>A single choice shown as a drop-down list instead of radio buttons.</summary>
    public bool ShowAsDropdown { get; set; }

    /// <summary>The order can't be sent without an answer.</summary>
    public bool IsRequired { get; set; }

    public int DisplayOrder { get; set; }
}
