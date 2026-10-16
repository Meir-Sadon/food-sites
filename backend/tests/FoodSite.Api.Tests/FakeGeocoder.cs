using FoodSite.Api.Delivery;

namespace FoodSite.Api.Tests;

/// <summary>Stands in for Nominatim: a few streets with a fixed point, anything else is not found.</summary>
public sealed class FakeGeocoder : IAddressGeocoder
{
    public Dictionary<string, GeoPoint> Points { get; } = new()
    {
        ["הרצל"] = new(0.02, 0.02),     // the near part
        ["רוטשילד"] = new(0.08, 0.08),  // the far part
        ["הנמל"] = new(0.5, 0.5),       // outside every zone
        ["השוק"] = new(0.12, 0.02),     // inside the blocked zone
    };

    public Task<GeoPoint?> FindAsync(string? city, string? street, string? houseNumber, CancellationToken ct) =>
        Task.FromResult(street is not null && Points.TryGetValue(street, out var p) ? p : (GeoPoint?)null);

    public Task<FoundAddress?> ReverseAsync(double lat, double lng, CancellationToken ct) =>
        Task.FromResult(Math.Abs(lat - 0.02) < 0.001 && Math.Abs(lng - 0.02) < 0.001 ? new FoundAddress("אשדוד", "הרצל", "1") : null);
}
