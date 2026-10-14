using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace FoodSite.Api.Delivery;

/// <summary>How a site prices delivery (<see cref="Settings.DeliveryPricing"/>).</summary>
public static class DeliveryPricing
{
    public const string Simple = "simple";
    public const string Zones = "zones";
    public static readonly IReadOnlyList<string> All = [Simple, Zones];

    public static bool IsKnown(string? value) => value is not null && All.Contains(value);
}

/// <summary>The one place that decides a delivery fee, for the order page's preview and for the order itself.</summary>
public class DeliveryQuoter(AppDbContext db, IAddressGeocoder geocoder)
{
    /// <summary>The mode the admin picked; <c>simple</c> until they pick another.</summary>
    public static string Mode(Settings settings) =>
        settings.DeliveryPricing == DeliveryPricing.Zones ? DeliveryPricing.Zones : DeliveryPricing.Simple;

    /// <summary>Null while the site uses the simple setting, so no fee is added.</summary>
    public async Task<DeliveryQuote?> QuoteAsync(Settings settings, string? city, string? street, string? houseNumber, CancellationToken ct)
    {
        if (Mode(settings) != DeliveryPricing.Zones)
            return null;
        var zones = await db.DeliveryZones.AsNoTracking().ToListAsync(ct);
        var point = zones.Count == 0 ? null : await geocoder.FindAsync(city, street, houseNumber, ct);
        return DeliveryZones.Quote(zones, point);
    }
}
