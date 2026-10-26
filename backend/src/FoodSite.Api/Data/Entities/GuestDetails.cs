namespace FoodSite.Api.Data.Entities;

/// <summary>
/// What a guest (no account) chose to keep for next time after an order, remembered by phone. The account made
/// later for that phone starts from it and the row is removed.
/// </summary>
public class GuestDetails
{
    public int Id { get; set; }
    public required string Phone { get; set; }
    public string FullName { get; set; } = "";
    public string City { get; set; } = "";
    public string Street { get; set; } = "";
    public string HouseNumber { get; set; } = "";
    public string Apartment { get; set; } = "";
    public DateTimeOffset SavedAt { get; set; }
}
