namespace FoodSite.Api.Data.Entities;

/// <summary>
/// A client's review of one order. Created (empty) when the admin first sends the order's review link;
/// the client fills it in once through <see cref="Token"/>, and the admin approves or blocks it.
/// </summary>
public class Review
{
    public const int TokenLength = 10;
    public const int NameMaxLength = 40;
    public const int CommentMaxLength = 1000;
    public const int MaxImages = 2;

    public int Id { get; set; }
    public int OrderId { get; set; }
    public Order? Order { get; set; }

    /// <summary>The secret in the review link (<c>/r/&lt;token&gt;</c>).</summary>
    public required string Token { get; set; }

    /// <summary>The name shown with the review; the client may change it from their first name.</summary>
    public string? Name { get; set; }

    /// <summary>1 to 5 once submitted.</summary>
    public int? Rating { get; set; }
    public string? Comment { get; set; }

    public ReviewStatus Status { get; set; } = ReviewStatus.Pending;
    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>Empty until the client submits; a review is submitted once.</summary>
    public DateTimeOffset? SubmittedAt { get; set; }

    public List<ReviewImage> Images { get; set; } = [];
}

public class ReviewImage
{
    public int Id { get; set; }
    public int ReviewId { get; set; }
    public Review? Review { get; set; }
    public required string Url { get; set; }
    public required string PublicId { get; set; }
    public int DisplayOrder { get; set; }
}
