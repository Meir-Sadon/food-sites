namespace FoodSite.Api.Data.Entities;

/// <summary>
/// A WhatsApp message the admin sends a client by hand from the Orders tab. The sent message starts with the
/// client's name, then <see cref="Text"/>, then (when <see cref="IncludeReviewLink"/>) the order's review link.
/// </summary>
public class MessageTemplate
{
    public const int NameMaxLength = 60;
    public const int TextMaxLength = 1000;

    public int Id { get; set; }
    public required string Name { get; set; }
    public required string Text { get; set; }
    public bool IncludeReviewLink { get; set; }

    /// <summary>The message type: the order status this template is for, picked first on an order with that status. Empty for a general message.</summary>
    public OrderStatus? ForStatus { get; set; }
}
