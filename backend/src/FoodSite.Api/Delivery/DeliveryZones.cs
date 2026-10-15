using System.Text.Json;
using FoodSite.Api.Data.Entities;

namespace FoodSite.Api.Delivery;

/// <param name="Approximate">Only the street or the city could be found, not the house: good enough for a rough place, not for a border.</param>
public record GeoPoint(double Lat, double Lng, bool Approximate = false);

/// <summary>What the zones say about one address.</summary>
/// <param name="Status"><c>ok</c> (a fee applies, which can be zero), <c>blocked</c> (no deliveries there), <c>unknown</c> (the address could not be placed on the map) or <c>outside</c> (regular setting: a city the kitchen does not list, the owner calls with the price).</param>
/// <param name="Approximate">The fee comes from a point that is only the street's or the city's, so the order should be checked.</param>
public record DeliveryQuote(string Status, decimal Fee, string? ZoneName, bool Approximate = false)
{
    public const string Outside = "outside";
    public const string Ok = "ok";
    public const string Blocked = "blocked";
    public const string Unknown = "unknown";
}

/// <summary>Works out the delivery fee from the zones the admin drew.</summary>
public static class DeliveryZones
{
    public const int MaxZones = 50;
    public const int MaxPoints = 200;
    public const decimal MaxFee = 10_000;

    public static List<GeoPoint>? ParsePolygon(string? json)
    {
        try
        {
            var raw = JsonSerializer.Deserialize<double[][]>(json ?? "");
            if (raw is null || raw.Length < 3 || raw.Length > MaxPoints || raw.Any(p => p is not { Length: 2 }))
                return null;
            var points = raw.Select(p => new GeoPoint(p[0], p[1])).ToList();
            return points.All(IsValid) ? points : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    public static string Serialize(IEnumerable<GeoPoint> points) =>
        JsonSerializer.Serialize(points.Select(p => new[] { Math.Round(p.Lat, 6), Math.Round(p.Lng, 6) }));

    private static bool IsValid(GeoPoint p) =>
        double.IsFinite(p.Lat) && double.IsFinite(p.Lng) && p.Lat is >= -90 and <= 90 && p.Lng is >= -180 and <= 180;

    /// <summary>Ray casting: is the point inside the polygon.</summary>
    public static bool Contains(IReadOnlyList<GeoPoint> polygon, GeoPoint point)
    {
        var inside = false;
        for (int i = 0, j = polygon.Count - 1; i < polygon.Count; j = i++)
        {
            var a = polygon[i];
            var b = polygon[j];
            if ((a.Lat > point.Lat) != (b.Lat > point.Lat)
                && point.Lng < (b.Lng - a.Lng) * (point.Lat - a.Lat) / (b.Lat - a.Lat) + a.Lng)
                inside = !inside;
        }
        return inside;
    }

    /// <summary>
    /// A blocked zone holding the point blocks the delivery; otherwise the first zone (lowest priority) holding it
    /// sets the fee. A point in no zone is not delivered to. With no zones drawn yet there is nothing to charge or
    /// refuse, so delivery is free.
    /// </summary>
    public static DeliveryQuote Quote(IReadOnlyList<DeliveryZone> zones, GeoPoint? point)
    {
        if (zones.Count == 0)
            return new(DeliveryQuote.Ok, 0m, null);
        if (point is null)
            return new(DeliveryQuote.Unknown, 0m, null);

        var holding = zones
            .Where(z => ParsePolygon(z.PolygonJson) is { } polygon && Contains(polygon, point))
            .OrderBy(z => z.Priority).ThenBy(z => z.Id)
            .ToList();
        if (holding.Find(z => z.IsBlocked) is { } blocked)
            return new(DeliveryQuote.Blocked, 0m, blocked.Name);
        return holding.FirstOrDefault() is { } zone
            ? new(DeliveryQuote.Ok, zone.Fee, zone.Name, point.Approximate)
            : new(DeliveryQuote.Blocked, 0m, null);
    }
}
