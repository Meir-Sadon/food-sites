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

/// <summary>
/// The large-order delivery discount: once the dishes reach <see cref="Settings.DeliveryDiscountMinOrder"/> the fee drops by the
/// base fee, never below zero. A near zone whose fee is the base fee is therefore free and a far one pays the rest.
/// </summary>
public static class DeliveryDiscount
{
    /// <summary>What comes off <paramref name="fee"/> for an order whose dishes cost <paramref name="dishesTotal"/>.</summary>
    public static decimal Amount(Settings settings, decimal dishesTotal, decimal fee)
    {
        if (fee <= 0m || settings.DeliveryDiscountMinOrder is not { } minimum || dishesTotal < minimum)
            return 0m;
        // The regular setting has one fixed fee, which is the base fee.
        var baseFee = DeliveryQuoter.Mode(settings) == DeliveryPricing.Zones ? settings.DeliveryBaseFee : settings.DeliveryBaseFee ?? fee;
        return baseFee is > 0m ? Math.Min(fee, baseFee.Value) : 0m;
    }
}

/// <summary>The one place that decides a delivery fee, for the order page's preview and for the order itself.</summary>
public class DeliveryQuoter(AppDbContext db, IAddressGeocoder geocoder)
{
    /// <summary>The mode the admin picked; <c>simple</c> until they pick another.</summary>
    public static string Mode(Settings settings) =>
        settings.DeliveryPricing == DeliveryPricing.Zones ? DeliveryPricing.Zones : DeliveryPricing.Simple;

    /// <summary>
    /// The regular setting: a fixed fee for the cities the kitchen lists; any other city is <c>outside</c> and the owner tells
    /// the client the price by phone. The advanced setting: the fee of the zone the address falls in.
    /// </summary>
    public async Task<DeliveryQuote> QuoteAsync(Settings settings, string? city, string? street, string? houseNumber, CancellationToken ct)
    {
        if (Mode(settings) != DeliveryPricing.Zones)
        {
            return Orders.ServiceArea.Serves(Orders.ServiceArea.Parse(settings.ServiceCities), city)
                ? new(DeliveryQuote.Ok, settings.DeliveryFeeAmount ?? 0m, null)
                : new(DeliveryQuote.Outside, 0m, null);
        }
        var zones = await db.DeliveryZones.AsNoTracking().ToListAsync(ct);
        var point = zones.Count == 0 ? null : await geocoder.FindAsync(city, street, houseNumber, ct);
        return DeliveryZones.Quote(zones, point);
    }

    /// <summary>
    /// What an address nobody could price is charged until the owner phones: the fixed fee of the regular setting, or the
    /// cheapest zone that delivers. The owner tells the client if more is due.
    /// </summary>
    public async Task<decimal> MinimumFeeAsync(Settings settings, CancellationToken ct)
    {
        if (Mode(settings) != DeliveryPricing.Zones)
            return settings.DeliveryFeeAmount ?? 0m;
        var fees = await db.DeliveryZones.AsNoTracking().Where(z => !z.IsBlocked).Select(z => z.Fee).ToListAsync(ct);
        return fees.Count == 0 ? 0m : fees.Min();
    }

    /// <summary>The fee at a point the client's phone reported, with the address read back from it.</summary>
    public async Task<DeliveryQuote> QuoteAtAsync(Settings settings, string city, GeoPoint point, CancellationToken ct)
    {
        if (Mode(settings) != DeliveryPricing.Zones)
            return await QuoteAsync(settings, city, null, null, ct);
        return DeliveryZones.Quote(await db.DeliveryZones.AsNoTracking().ToListAsync(ct), point);
    }

    public Task<FoundAddress?> AddressAtAsync(double lat, double lng, CancellationToken ct) => geocoder.ReverseAsync(lat, lng, ct);
}
