using FoodSite.Api.Controllers.Admin;
using FoodSite.Api.Data;
using FoodSite.Api.Delivery;
using FoodSite.Api.Orders;
using FoodSite.Api.Sites;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using static FoodSite.Api.Controllers.Admin.Ordering;

namespace FoodSite.Api.Controllers;

/// <summary>The delivery fee for an address, so the order page can show it before the order is sent.</summary>
[Route("api/delivery-quote")]
[EnableRateLimiting(PublicControllerBase.WriteRateLimitPolicy)]
public class DeliveryController(AppDbContext db, DeliveryQuoter quoter) : PublicControllerBase
{
    public record QuoteInput(string? City, string? Street, string? HouseNumber);

    /// <param name="Status"><c>ok</c>, <c>blocked</c>, <c>unknown</c> or <c>outside</c> (see <see cref="DeliveryQuote"/>).</param>
    public record QuoteDto(string Status, decimal Fee, string? ZoneName, bool Approximate = false);

    public record LocateInput(double Lat, double Lng);

    /// <summary>The address at the client's position and what delivery there costs; <c>Found</c> is false when the position is not an address in Israel.</summary>
    public record LocateDto(bool Found, string City, string Street, string HouseNumber, QuoteDto? Quote);

    [HttpPost]
    public async Task<ActionResult<QuoteDto>> Quote(QuoteInput input, CancellationToken ct)
    {
        var errors = new Errors();
        errors.Text(nameof(input.City), input.City, AddressFormat.PartMaxLength, required: true);
        errors.Text(nameof(input.Street), input.Street, AddressFormat.PartMaxLength, required: true);
        errors.Text(nameof(input.HouseNumber), input.HouseNumber, AddressFormat.PartMaxLength, required: true);
        if (errors.Any)
            return Invalid(errors);

        var settings = await db.Settings.AsNoTracking().SingleAsync(ct);
        var quote = await quoter.QuoteAsync(settings, input.City, input.Street, input.HouseNumber, ct);
        return new QuoteDto(quote.Status, quote.Fee, quote.ZoneName, quote.Approximate);
    }

    /// <summary>"Find my location": the phone's position becomes the address fields and the fee.</summary>
    [HttpPost("locate")]
    public async Task<ActionResult<LocateDto>> Locate(LocateInput input, CancellationToken ct)
    {
        if (!double.IsFinite(input.Lat) || !double.IsFinite(input.Lng) || input.Lat is < -90 or > 90 || input.Lng is < -180 or > 180)
            return Invalid("lat", "invalid");
        var address = await quoter.AddressAtAsync(input.Lat, input.Lng, ct);
        if (address is null)
            return new LocateDto(false, "", "", "", null);
        var settings = await db.Settings.AsNoTracking().SingleAsync(ct);
        var quote = await quoter.QuoteAtAsync(settings, address.City, new GeoPoint(input.Lat, input.Lng), ct);
        return new LocateDto(true, address.City, address.Street, address.HouseNumber,
            new QuoteDto(quote.Status, quote.Fee, quote.ZoneName, quote.Approximate));
    }
}
