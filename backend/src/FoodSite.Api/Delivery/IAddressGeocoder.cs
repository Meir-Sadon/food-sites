using System.Globalization;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;

namespace FoodSite.Api.Delivery;

/// <summary>Turns an address in Israel into a point on the map; null when it cannot be found.</summary>
public interface IAddressGeocoder
{
    Task<GeoPoint?> FindAsync(string? city, string? street, string? houseNumber, CancellationToken ct);
}

/// <summary>
/// OpenStreetMap's Nominatim (free, no key). Its policy allows one request a second and asks for a real
/// User-Agent, so answers are cached and a failure or timeout is just "not found": the order then waits for the admin.
/// </summary>
public class NominatimGeocoder(HttpClient http, IMemoryCache cache, ILogger<NominatimGeocoder> logger) : IAddressGeocoder
{
    private static readonly SemaphoreSlim Gate = new(1, 1);
    private static DateTime nextAllowed = DateTime.MinValue;

    public async Task<GeoPoint?> FindAsync(string? city, string? street, string? houseNumber, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(city) || string.IsNullOrWhiteSpace(street))
            return null;
        var key = $"geo:{city.Trim()}|{street.Trim()}|{houseNumber?.Trim()}";
        if (cache.TryGetValue(key, out GeoPoint? cached))
            return cached;

        var found = await QueryAsync(city.Trim(), street.Trim(), houseNumber?.Trim(), ct);
        // A miss caused by an outage is not kept for long.
        cache.Set(key, found, found is null ? TimeSpan.FromMinutes(5) : TimeSpan.FromDays(30));
        return found;
    }

    private async Task<GeoPoint?> QueryAsync(string city, string street, string? house, CancellationToken ct)
    {
        await Gate.WaitAsync(ct);
        try
        {
            var wait = nextAllowed - DateTime.UtcNow;
            if (wait > TimeSpan.Zero)
                await Task.Delay(wait, ct);
            nextAllowed = DateTime.UtcNow.AddMilliseconds(1100);

            var streetPart = string.IsNullOrWhiteSpace(house) ? street : $"{house} {street}";
            var url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=il&accept-language=he"
                + $"&city={Uri.EscapeDataString(city)}&street={Uri.EscapeDataString(streetPart)}";
            using var response = await http.GetAsync(url, ct);
            if (!response.IsSuccessStatusCode)
                return null;
            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
            if (doc.RootElement.ValueKind != JsonValueKind.Array || doc.RootElement.GetArrayLength() == 0)
                return null;
            var first = doc.RootElement[0];
            return double.TryParse(first.GetProperty("lat").GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var lat)
                && double.TryParse(first.GetProperty("lon").GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var lng)
                ? new GeoPoint(lat, lng)
                : null;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException or KeyNotFoundException)
        {
            if (!ct.IsCancellationRequested)
                logger.LogWarning(ex, "Geocoding {City} {Street} failed", city, street);
            return null;
        }
        finally
        {
            Gate.Release();
        }
    }
}
