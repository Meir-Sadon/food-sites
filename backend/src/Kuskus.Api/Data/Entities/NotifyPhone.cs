namespace Kuskus.Api.Data.Entities;

/// <summary>A phone that gets a WhatsApp message for every new order.</summary>
public class NotifyPhone
{
    public int Id { get; set; }
    public required string Phone { get; set; }
    public string? Name { get; set; }
}
