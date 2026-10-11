namespace FoodSite.Api.Data.Entities;

public enum FeedbackKind
{
    /// <summary>Something does not work.</summary>
    Problem,
    /// <summary>A comment or a request.</summary>
    Comment,
}

/// <summary>
/// A problem or a comment an admin reported from the admin area ("דיווח על בעיה / הערה"). Kept in the site's own
/// database; the console collects it through the ops API and marks it handled.
/// </summary>
public class Feedback
{
    public const int TextMaxLength = 2000;
    public const int PageMaxLength = 200;

    public int Id { get; set; }
    public FeedbackKind Kind { get; set; }
    public required string Text { get; set; }

    /// <summary>The admin page the report was sent from (a path such as <c>/admin/orders</c>).</summary>
    public string? Page { get; set; }

    /// <summary>Which admin sent it: a name from <see cref="Auth.AdminActor"/>.</summary>
    public required string Actor { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public bool IsHandled { get; set; }
}
