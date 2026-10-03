namespace Kuskus.Api.Data.Entities;

public class Recommendation
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public User? User { get; set; }
    public required string Text { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public bool IsHandled { get; set; }
}
