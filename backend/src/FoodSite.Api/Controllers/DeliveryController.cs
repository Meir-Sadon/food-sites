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
[RequireFeature(Features.DeliveryZones)]
public class DeliveryController(AppDbContext db, DeliveryQuoter quoter) : PublicControllerBase
{
    public record QuoteInput(string? City, string? Street, string? HouseNumber);

    /// <param name="Status"><c>ok</c>, <c>blocked</c> or <c>unknown</c> (see <see cref="DeliveryQuote"/>); <c>none</c> while the site prices delivery the simple way.</param>
    public record QuoteDto(string Status, decimal Fee, string? ZoneName);

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
        return quote is null ? new QuoteDto("none", 0m, null) : new QuoteDto(quote.Status, quote.Fee, quote.ZoneName);
    }
}
