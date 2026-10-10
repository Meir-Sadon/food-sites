using FoodSite.Api.Controllers.Admin;
using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Deliveries;
using FoodSite.Api.Images;
using FoodSite.Api.Orders;
using FoodSite.Api.Sites;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using static FoodSite.Api.Controllers.Admin.Ordering;

namespace FoodSite.Api.Controllers;

/// <summary>
/// The driver's page behind the link the admin sent (<c>/d/&lt;token&gt;</c>). The token is the only key: it opens
/// the stops of its own route and nothing else, and only while the link works. For each stop the driver sees what
/// to hand over and collect, and reports the outcome, how it was paid, a note and a photo.
/// </summary>
[Route("api/driver/{token}")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public class DriverController(
    AppDbContext db, IImageStore images, IOptions<SiteOptions> site, SiteClock clock, TimeProvider time) : PublicControllerBase
{
    public const int PaymentCommentMaxLength = OrdersAdminController.PaymentCommentMaxLength;

    public record DriverItemDto(int Id, int? ParentItemId, string DishName, string? OptionLabel, decimal Quantity);

    /// <summary>
    /// One stop as the driver sees it: no account, history or admin details. The payment comment shows only when
    /// the driver wrote it.
    /// </summary>
    public record DriverStopDto(
        int OrderId,
        int Position,
        TimeOnly? PlannedArrival,
        string Name,
        string Phone,
        string Address,
        TimeOnly? DeliveryHour,
        string? Notes,
        IReadOnlyList<DriverItemDto> Items,
        decimal Total,
        PaymentMethod PaymentMethod,
        bool IsPaid,
        PaidWith? PaidWith,
        string? PaymentComment,
        bool PaidByDriver,
        bool Cancelled,
        DeliveryOutcome? Outcome,
        DateTimeOffset? ReportedAt,
        string? DeliveryNote,
        string? ProofUrl);

    public record DriverRouteDto(DateOnly Date, DateOnly ValidThrough, IReadOnlyList<DriverStopDto> Stops);

    /// <summary>
    /// The driver's report for a stop, sent again to correct it. PaidWith records a payment collected at the door;
    /// empty means nothing was collected. An order the admin already marked paid keeps the admin's record.
    /// </summary>
    public record DeliveryInput(DeliveryOutcome? Outcome, PaidWith? PaidWith = null, string? PaymentComment = null, string? Note = null);

    [HttpGet]
    public async Task<ActionResult<DriverRouteDto>> Get(string token, CancellationToken ct)
    {
        var route = await FindAsync(token, ct);
        if (route is null)
            return NotFound();
        return new DriverRouteDto(
            route.SupplyDate, DriverLinks.ValidThrough(route.SupplyDate),
            route.Stops.OrderBy(s => s.Position).Select(ToDto).ToList());
    }

    [HttpPut("orders/{orderId:int}/delivery")]
    [EnableRateLimiting(WriteRateLimitPolicy)]
    public async Task<ActionResult<DriverStopDto>> Report(string token, int orderId, DeliveryInput input, CancellationToken ct)
    {
        var stop = await FindStopAsync(token, orderId, ct);
        if (stop is null)
            return NotFound();
        var order = stop.Order!;
        if (order.Status == OrderStatus.Cancelled)
            return Conflict("orderCancelled");

        var errors = new Errors();
        if (input.Outcome is not { } outcome || !Enum.IsDefined(outcome))
        {
            errors.Add(nameof(input.Outcome), "required");
            outcome = default;
        }
        // Someone at the office needs to know why an order came back.
        errors.Text(nameof(input.Note), input.Note, Order.DeliveryNoteMaxLength, required: outcome == DeliveryOutcome.NotDelivered);
        var collects = outcome == DeliveryOutcome.Delivered && input.PaidWith is not null && (!order.IsPaid || order.PaidByDriver);
        if (collects)
        {
            if (!Enum.IsDefined(input.PaidWith!.Value) || input.PaidWith == PaidWith.Unknown)
                errors.Add(nameof(input.PaidWith), "invalid");
            errors.Text(nameof(input.PaymentComment), input.PaymentComment, PaymentCommentMaxLength);
        }
        if (errors.Any)
            return Invalid(errors);

        order.DeliveryOutcome = outcome;
        order.DeliveryReportedAt = time.GetUtcNow();
        order.DeliveryNote = Clean(input.Note);
        if (collects)
            SetPayment(order, input.PaidWith, Clean(input.PaymentComment));
        else if (order.PaidByDriver)
            // The driver's own earlier payment record follows the corrected report: nothing collected now.
            SetPayment(order, null, null);
        order.Status = outcome == DeliveryOutcome.Delivered
            ? OrderStatus.Delivered
            : order.Status == OrderStatus.Delivered ? OrderStatus.Ready : order.Status;
        await db.SaveChangesAsync(ct);
        return ToDto(stop);
    }

    /// <summary>Takes back a report sent by mistake, with the payment the driver recorded. The photo stays.</summary>
    [HttpDelete("orders/{orderId:int}/delivery")]
    [EnableRateLimiting(WriteRateLimitPolicy)]
    public async Task<ActionResult<DriverStopDto>> Undo(string token, int orderId, CancellationToken ct)
    {
        var stop = await FindStopAsync(token, orderId, ct);
        if (stop is null)
            return NotFound();
        var order = stop.Order!;
        if (order.DeliveryOutcome == DeliveryOutcome.Delivered && order.Status == OrderStatus.Delivered)
            order.Status = OrderStatus.Ready;
        order.DeliveryOutcome = null;
        order.DeliveryReportedAt = null;
        order.DeliveryNote = null;
        if (order.PaidByDriver)
            SetPayment(order, null, null);
        await db.SaveChangesAsync(ct);
        return ToDto(stop);
    }

    /// <summary>The photo of the order at the door; a new one replaces the last.</summary>
    [HttpPost("orders/{orderId:int}/proof")]
    [EnableRateLimiting(WriteRateLimitPolicy)]
    [RequestSizeLimit(ImageUploadRules.MaxRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = ImageUploadRules.MaxRequestBytes)]
    public async Task<ActionResult<DriverStopDto>> AddProof(string token, int orderId, IFormFile? file, CancellationToken ct)
    {
        var stop = await FindStopAsync(token, orderId, ct);
        if (stop is null)
            return NotFound();
        if (ImageUploadRules.Validate(file) is { } code)
            return Invalid("file", code);

        StoredImage stored;
        try
        {
            await using var stream = file!.OpenReadStream();
            stored = await images.UploadAsync(stream, file.FileName, site.Value.ImageFolder("deliveries"), ct);
        }
        catch (ImageStoreUnavailableException e)
        {
            return AdminControllerBase.ImageStoreError(this, e);
        }

        var order = stop.Order!;
        var previous = order.DeliveryProofPublicId;
        order.DeliveryProofUrl = stored.Url;
        order.DeliveryProofPublicId = stored.PublicId;
        await db.SaveChangesAsync(ct);
        if (previous is not null)
            await images.DeleteAsync(previous, ct);
        return ToDto(stop);
    }

    [HttpDelete("orders/{orderId:int}/proof")]
    [EnableRateLimiting(WriteRateLimitPolicy)]
    public async Task<ActionResult<DriverStopDto>> RemoveProof(string token, int orderId, CancellationToken ct)
    {
        var stop = await FindStopAsync(token, orderId, ct);
        if (stop is null)
            return NotFound();
        var order = stop.Order!;
        var previous = order.DeliveryProofPublicId;
        order.DeliveryProofUrl = null;
        order.DeliveryProofPublicId = null;
        await db.SaveChangesAsync(ct);
        if (previous is not null)
            await images.DeleteAsync(previous, ct);
        return ToDto(stop);
    }

    private static void SetPayment(Order order, PaidWith? paidWith, string? comment)
    {
        order.IsPaid = paidWith is not null;
        order.PaidWith = paidWith;
        order.PaymentComment = comment;
        order.PaidByDriver = paidWith is not null;
    }

    /// <summary>The route behind a link that still works, with its stops' orders; null for any other token.</summary>
    private async Task<DriverRoute?> FindAsync(string token, CancellationToken ct)
    {
        if (!DriverLinks.LooksLikeToken(token))
            return null;
        var route = await db.DriverRoutes
            .Include(r => r.Stops).ThenInclude(s => s.Order).ThenInclude(o => o!.Items)
            .AsSplitQuery()
            .SingleOrDefaultAsync(r => r.Token == token, ct);
        return route is not null && DriverLinks.IsValid(route.SupplyDate, clock.NowLocal()) ? route : null;
    }

    private async Task<DriverRouteStop?> FindStopAsync(string token, int orderId, CancellationToken ct) =>
        (await FindAsync(token, ct))?.Stops.SingleOrDefault(s => s.OrderId == orderId);

    private static DriverStopDto ToDto(DriverRouteStop stop)
    {
        var o = stop.Order!;
        return new DriverStopDto(
            o.Id, stop.Position, stop.PlannedArrival, o.Name, o.Phone, o.Address, o.DeliveryHour, o.Notes,
            o.Items.OrderBy(i => i.Id).Select(i => new DriverItemDto(i.Id, i.ParentItemId, i.DishName, i.OptionLabel, i.Quantity)).ToList(),
            o.Total, o.PaymentMethod, o.IsPaid, o.PaidWith, o.PaidByDriver ? o.PaymentComment : null, o.PaidByDriver,
            o.Status == OrderStatus.Cancelled,
            o.DeliveryOutcome, o.DeliveryReportedAt, o.DeliveryNote, o.DeliveryProofUrl);
    }
}
