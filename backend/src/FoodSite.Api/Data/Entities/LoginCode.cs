namespace FoodSite.Api.Data.Entities;

/// <summary>A short-lived one-time login code sent by WhatsApp. Only a hash of the code is stored.</summary>
public class LoginCode
{
    public int Id { get; set; }
    public required string Phone { get; set; }
    public required string CodeHash { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public int Attempts { get; set; }
}
