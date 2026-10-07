namespace Kuskus.Api.Data.Entities;

public class ClosedDate
{
    public int Id { get; set; }
    public DateOnly Date { get; set; }
    public string? Reason { get; set; }
}
