using System.Globalization;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;

namespace FoodSite.Api.Delivery;

/// <summary>An address read back from a point on the map.</summary>
public record FoundAddress(string City, string Street, string HouseNumber);

/// <summary>Turns an address in Israel into a point on the map, and a point back into an address.</summary>
public interface IAddressGeocoder
{
    /// <summary>The point of the address, null when nothing was found. Only the street or the city found: <see cref="GeoPoint.Approximate"/>.</summary>
    Task<GeoPoint?> FindAsync(string? city, string? street, string? houseNumber, CancellationToken ct);

    /// <summary>The address at a point (the client's own position), null when it is not in Israel or nothing is there.</summary>
    Task<FoundAddress?> ReverseAsync(double lat, double lng, CancellationToken ct);
}

/// <summary>
/// OpenStreetMap's Nominatim (free, no key). Its policy allows one request a second and asks for a real
/// User-Agent, so answers are cached and a failure or timeout is just "not found": the order then waits for the admin.
/// Israeli house numbers are patchy in OpenStreetMap, so a search that finds nothing is retried with fewer details.
/// </summary>
public class NominatimGeocoder(HttpClient http, IMemoryCache cache, ILogger<NominatimGeocoder> logger) : IAddressGeocoder
{
    private const string Base = "https://nominatim.openstreetmap.org";
    private static readonly SemaphoreSlim Gate = new(1, 1);
    private static DateTime nextAllowed = DateTime.MinValue;

    public async Task<GeoPoint?> FindAsync(string? city, string? street, string? houseNumber, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(city))
            return null;
        city = city.Trim();
        street = street?.Trim();
        houseNumber = houseNumber?.Trim();
        var key = $"geo:{city}|{street}|{houseNumber}";
        if (cache.TryGetValue(key, out GeoPoint? cached))
            return cached;

        var found = await SearchAsync(city, street, houseNumber, ct);
        // A miss caused by an outage is not kept for long.
        cache.Set(key, found, found is null ? TimeSpan.FromMinutes(5) : TimeSpan.FromDays(30));
        return found;
    }

    private async Task<GeoPoint?> SearchAsync(string city, string? street, string? house, CancellationToken ct)
    {
        var haveStreet = !string.IsNullOrWhiteSpace(street);
        var haveHouse = haveStreet && !string.IsNullOrWhiteSpace(house);
        var c = Uri.EscapeDataString(city);
        if (haveHouse && await QueryAsync($"city={c}&street={Uri.EscapeDataString($"{house} {street}")}", false, ct) is { } exact)
            return exact;
        if (haveStreet && await QueryAsync($"q={Uri.EscapeDataString($"{(haveHouse ? house + " " : "")}{street}, {city}")}", false, ct) is { } free)
            return free;
        if (haveStreet && await QueryAsync($"city={c}&street={Uri.EscapeDataString(street!)}", haveHouse, ct) is { } onStreet)
            return onStreet with { Approximate = haveHouse };
        return await QueryAsync($"city={c}", true, ct);
    }

    private async Task<GeoPoint?> QueryAsync(string query, bool approximate, CancellationToken ct)
    {
        var body = await GetAsync($"{Base}/search?format=jsonv2&limit=1&countrycodes=il&accept-language=he&{query}", ct);
        if (body is null)
            return null;
        try
        {
            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.ValueKind != JsonValueKind.Array || doc.RootElement.GetArrayLength() == 0)
                return null;
            var first = doc.RootElement[0];
            return double.TryParse(first.GetProperty("lat").GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var lat)
                && double.TryParse(first.GetProperty("lon").GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var lng)
                ? new GeoPoint(lat, lng, approximate)
                : null;
        }
        catch (Exception ex) when (ex is JsonException or KeyNotFoundException)
        {
            logger.LogWarning(ex, "Geocoding answer could not be read");
            return null;
        }
    }

    public async Task<FoundAddress?> ReverseAsync(double lat, double lng, CancellationToken ct)
    {
        var l = lat.ToString("0.000000", CultureInfo.InvariantCulture);
        var n = lng.ToString("0.000000", CultureInfo.InvariantCulture);
        var body = await GetAsync($"{Base}/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=he&lat={l}&lon={n}", ct);
        if (body is null)
            return null;
        try
        {
            using var doc = JsonDocument.Parse(body);
            if (!doc.RootElement.TryGetProperty("address", out var address) || address.ValueKind != JsonValueKind.Object)
                return null;
            if (address.TryGetProperty("country_code", out var country) && country.GetString() != "il")
                return null;
            string Part(params string[] names) =>
                names.Select(name => address.TryGetProperty(name, out var v) ? v.GetString() : null).FirstOrDefault(v => !string.IsNullOrWhiteSpace(v)) ?? "";
            var city = Part("city", "town", "village", "municipality", "suburb");
            return city == "" ? null : new FoundAddress(city, Part("road", "pedestrian", "residential", "footway"), Part("house_number"));
        }
        catch (JsonException ex)
        {
            logger.LogWarning(ex, "Reverse geocoding answer could not be read");
            return null;
        }
    }

    /// <summary>One polite request: one a second across the whole app. Null on any failure (logged).</summary>
    private async Task<string?> GetAsync(string url, CancellationToken ct)
    {
        await Gate.WaitAsync(ct);
        try
        {
            var wait = nextAllowed - DateTime.UtcNow;
            if (wait > TimeSpan.Zero)
                await Task.Delay(wait, ct);
            nextAllowed = DateTime.UtcNow.AddMilliseconds(1100);
            using var response = await http.GetAsync(url, ct);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("Nominatim answered {Status} for {Path}", (int)response.StatusCode, new Uri(url).AbsolutePath);
                return null;
            }
            return await response.Content.ReadAsStringAsync(ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            if (!ct.IsCancellationRequested)
                logger.LogWarning(ex, "Nominatim request failed");
            return null;
        }
        finally
        {
            Gate.Release();
        }
    }
}
