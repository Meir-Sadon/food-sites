using System.Text.Json;
using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Payments;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace FoodSite.Api.Controllers;

/// <summary>
/// The two ways a card payment on Invoice4U's page comes back: the clearing company calls the server
/// (<see cref="Callback"/>), and the client's browser returns to the site, which asks <see cref="Status"/>.
/// Both carry the order id and a signature only this server can make (<see cref="CardLinks"/>).
/// </summary>
[ApiController]
[Route("api/payments/card")]
[EnableRateLimiting(PublicControllerBase.WriteRateLimitPolicy)]
public class CardPaymentsController(AppDbContext db, CardLinks links, CardSettlement settlement, ILogger<CardPaymentsController> logger) : ControllerBase
{
    public record StatusDto(bool Paid, decimal Total);

    /// <summary>
    /// Invoice4U posts a form with one field, <c>Data</c>, holding JSON. What it says is only a hint: the order is paid
    /// when the clearing log confirms the charge. A failed lookup answers an error so the call can be tried again.
    /// </summary>
    [HttpPost("callback")]
    public async Task<IActionResult> Callback([FromQuery] int order, [FromQuery] string? sig, CancellationToken ct)
    {
        if (!links.IsValid(order, sig))
            return NotFound();
        var found = await db.Orders.Include(o => o.Items).SingleOrDefaultAsync(o => o.Id == order, ct);
        if (found is null)
            return NotFound();

        string? paymentId = null;
        var success = false;
        try
        {
            var form = await Request.ReadFormAsync(ct);
            using var json = JsonDocument.Parse(form["Data"].ToString());
            string? Text(string name) => json.RootElement.TryGetProperty(name, out var v) ? v.ToString() : null;
            success = string.Equals(Text("Success"), "true", StringComparison.OrdinalIgnoreCase);
            paymentId = Text("PaymentId");
            if (!success)
                logger.LogInformation("Card payment for order {OrderId} was not completed: {Message}", order, Text("ErrorMessage"));
        }
        catch (Exception ex) when (ex is JsonException or InvalidOperationException)
        {
            logger.LogWarning(ex, "Unreadable card payment callback for order {OrderId}", order);
            return BadRequest();
        }

        if (!success)
            return Ok();
        try
        {
            await settlement.TryConfirmAsync(found, paymentId, $"{Request.Scheme}://{Request.Host}", ct);
        }
        catch (CardGatewayException ex)
        {
            logger.LogError(ex, "Could not confirm the card payment of order {OrderId}", order);
            return StatusCode(StatusCodes.Status502BadGateway);
        }
        return Ok();
    }

    /// <summary>
    /// What the return page asks. An order still unpaid is looked up at the clearing company, in case the callback
    /// has not arrived (or was lost).
    /// </summary>
    [HttpGet("status")]
    public async Task<ActionResult<StatusDto>> Status([FromQuery] int order, [FromQuery] string? sig, CancellationToken ct)
    {
        if (!links.IsValid(order, sig))
            return NotFound();
        var found = await db.Orders.Include(o => o.Items).SingleOrDefaultAsync(o => o.Id == order && o.PaymentMethod == PaymentMethod.CreditCard, ct);
        if (found is null)
            return NotFound();
        var paid = found.IsPaid;
        if (!paid)
        {
            try
            {
                paid = await settlement.TryConfirmAsync(found, null, $"{Request.Scheme}://{Request.Host}", ct);
            }
            catch (CardGatewayException ex)
            {
                logger.LogWarning(ex, "Could not look up the card payment of order {OrderId}", order);
            }
        }
        return new StatusDto(paid, found.Total);
    }
}
