using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Delivery;
using FoodSite.Api.Sites;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using static FoodSite.Api.Controllers.Admin.Ordering;

namespace FoodSite.Api.Controllers.Admin;

/// <summary>The areas of the advanced delivery setting, saved together: the list sent replaces the list stored.</summary>
[Route("api/admin/delivery-zones")]
[RequireFeature(Features.DeliveryZones)]
public class DeliveryZonesController(AppDbContext db) : AdminControllerBase
{
    public record ZoneDto(int Id, string Name, decimal Fee, bool IsBlocked, int Priority, IReadOnlyList<double[]> Polygon);

    public record ZoneInput(int? Id, string? Name, decimal Fee, bool IsBlocked, List<double[]>? Polygon);

    public record ZonesInput(List<ZoneInput>? Zones);

    [HttpGet]
    public async Task<IReadOnlyList<ZoneDto>> Get() =>
        (await db.DeliveryZones.AsNoTracking().OrderBy(z => z.Priority).ThenBy(z => z.Id).ToListAsync()).Select(ToDto).ToList();

    [HttpPut]
    public async Task<ActionResult<IReadOnlyList<ZoneDto>>> Replace(ZonesInput input)
    {
        var zones = input.Zones ?? [];
        var errors = new Errors();
        if (zones.Count > DeliveryZones.MaxZones)
            errors.Add("zones", "tooMany");
        var polygons = new List<List<GeoPoint>?>();
        for (var i = 0; i < zones.Count; i++)
        {
            var zone = zones[i];
            errors.Text($"zones[{i}].name", zone.Name, DeliveryZone.NameMaxLength, required: true);
            if (zone.Fee is < 0m or > DeliveryZones.MaxFee)
                errors.Add($"zones[{i}].fee", "invalid");
            var polygon = DeliveryZones.ParsePolygon(System.Text.Json.JsonSerializer.Serialize(zone.Polygon ?? []));
            if (polygon is null)
                errors.Add($"zones[{i}].polygon", "invalid");
            polygons.Add(polygon);
        }
        if (errors.Any)
            return Invalid(errors);

        var existing = await db.DeliveryZones.ToDictionaryAsync(z => z.Id);
        var kept = new HashSet<int>();
        for (var i = 0; i < zones.Count; i++)
        {
            var zone = zones[i];
            if (zone.Id is { } id && existing.TryGetValue(id, out var row))
                kept.Add(id);
            else
                db.DeliveryZones.Add(row = new DeliveryZone { Name = "", PolygonJson = "" });
            row.Name = zone.Name!.Trim();
            row.Fee = decimal.Round(zone.Fee, 2);
            row.IsBlocked = zone.IsBlocked;
            row.Priority = i;
            row.PolygonJson = DeliveryZones.Serialize(polygons[i]!);
        }
        // Loaded and removed one by one, so the removals reach the audit trail.
        db.DeliveryZones.RemoveRange(existing.Values.Where(z => !kept.Contains(z.Id)));
        await db.SaveChangesAsync();
        return (await Get()).ToList();
    }

    private static ZoneDto ToDto(DeliveryZone z) => new(
        z.Id, z.Name, z.Fee, z.IsBlocked, z.Priority,
        (DeliveryZones.ParsePolygon(z.PolygonJson) ?? []).Select(p => new[] { p.Lat, p.Lng }).ToList());
}
