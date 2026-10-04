using Kuskus.Api.Auth;
using Kuskus.Api.Controllers.Admin;
using Kuskus.Api.Data;
using Kuskus.Api.Data.Entities;
using Kuskus.Api.Messaging;
using Kuskus.Api.Orders;
using Kuskus.Api.Phones;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using static Kuskus.Api.Controllers.Admin.Ordering;

namespace Kuskus.Api.Controllers;

[Route("api/orders")]
[EnableRateLimiting(PublicControllerBase.WriteRateLimitPolicy)]
public class OrdersController(
    AppDbContext db,
    SiteClock clock,
    PhoneVerificationService verification,
    IWhatsAppSender whatsApp,
    ILogger<OrdersController> logger) : PublicControllerBase
{
    public const int NameMaxLength = 100;
    public const int AddressMaxLength = 300;
    public const int NotesMaxLength = 500;

    public record OrderInput(
        string? Phone,
        string? Name,
        string? Address,
        DateOnly SupplyDate,
        FulfillmentMethod FulfillmentMethod,
        PaymentMethod PaymentMethod,
        string? Notes,
        string? VerificationToken,
        List<OrderLineInput>? Items);

    public record ConfirmationItemDto(
        string DishName, string? OptionLabel, decimal Quantity, decimal UnitPrice, decimal LineTotal, bool IsAddOn);

    public record ConfirmationDto(
        int Id,
        DateOnly SupplyDate,
        FulfillmentMethod FulfillmentMethod,
        PaymentMethod PaymentMethod,
        decimal Total,
        string? PaymentPhone,
        IReadOnlyList<ConfirmationItemDto> Items);

    [HttpPost]
    public async Task<ActionResult<ConfirmationDto>> Create(OrderInput input, CancellationToken ct)
    {
        var errors = new Errors();
        var settings = await db.Settings.AsNoTracking().SingleAsync(ct);

        errors.Text(nameof(input.Name), input.Name, NameMaxLength, required: true);
        errors.Text(nameof(input.Notes), input.Notes, NotesMaxLength);
        var phone = PhoneNumber.Normalize(input.Phone);
        if (phone is null)
            errors.Add(nameof(input.Phone), "phone");

        if (!Enum.IsDefined(input.FulfillmentMethod))
            errors.Add(nameof(input.FulfillmentMethod), "invalid");
        else if (input.FulfillmentMethod == FulfillmentMethod.Delivery)
        {
            if (!settings.DeliveryEnabled) errors.Add(nameof(input.FulfillmentMethod), "fulfillmentUnavailable");
            errors.Text(nameof(input.Address), input.Address, AddressMaxLength, required: true);
        }
        else
        {
            if (!settings.PickupEnabled) errors.Add(nameof(input.FulfillmentMethod), "fulfillmentUnavailable");
            errors.Text(nameof(input.Address), input.Address, AddressMaxLength);
        }

        if (!Enum.IsDefined(input.PaymentMethod))
            errors.Add(nameof(input.PaymentMethod), "invalid");
        else if (input.PaymentMethod == PaymentMethod.Transfer && string.IsNullOrWhiteSpace(settings.PaymentPhone))
            errors.Add(nameof(input.PaymentMethod), "paymentUnavailable");

        var days = await db.SupplyDays.AsNoTracking().ToListAsync(ct);
        var closed = await db.ClosedDates.AsNoTracking().Select(c => c.Date).ToListAsync(ct);
        if (!SupplyCalendar.IsOpen(input.SupplyDate, clock.NowLocal(), days, closed))
            errors.Add(nameof(input.SupplyDate), "supplyDateUnavailable");

        if (phone is not null && !await verification.IsVerifiedAsync(input.VerificationToken, phone))
            errors.Add(nameof(input.Phone), "phoneNotVerified");

        var ids = (input.Items ?? [])
            .SelectMany(i => (i.AddOns ?? []).Select(a => a.DishId).Append(i.DishId))
            .Distinct().ToList();
        var dishes = await db.Dishes
            .Include(d => d.Category).Include(d => d.Options).Include(d => d.AddOns)
            .AsSplitQuery()
            .Where(d => ids.Contains(d.Id))
            .ToDictionaryAsync(d => d.Id, ct);
        var items = OrderBuilder.Build(input.Items, dishes, errors);

        if (errors.Any)
            return Invalid(errors);

        var order = new Order
        {
            Phone = phone!,
            Name = input.Name!.Trim(),
            Address = Clean(input.Address) ?? "",
            SupplyDate = input.SupplyDate,
            FulfillmentMethod = input.FulfillmentMethod,
            Notes = Clean(input.Notes),
            PaymentMethod = input.PaymentMethod,
            Status = OrderStatus.New,
            Total = OrderBuilder.Total(items),
            CreatedAt = DateTimeOffset.UtcNow,
        };
        foreach (var item in items)
            order.Items.Add(item);
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);

        await NotifyAsync(order, settings.PaymentPhone, ct);

        return new ConfirmationDto(
            order.Id, order.SupplyDate, order.FulfillmentMethod, order.PaymentMethod, order.Total,
            order.PaymentMethod == PaymentMethod.Transfer ? settings.PaymentPhone : null,
            order.Items
                .Select(i => new ConfirmationItemDto(i.DishName, i.OptionLabel, i.Quantity, i.UnitPrice, i.LineTotal, i.ParentItem is not null))
                .ToList());
    }

    /// <summary>
    /// Tells the client and everyone on the admin's list. A failed message never fails the
    /// order: it is already saved and shows in the admin's Orders tab.
    /// </summary>
    private async Task NotifyAsync(Order order, string? paymentPhone, CancellationToken ct)
    {
        var admins = await db.NotifyPhones.AsNoTracking().Select(p => p.Phone).ToListAsync(CancellationToken.None);
        var messages = admins.Select(phone => (phone, text: OrderMessages.AdminNotification(order)))
            .Prepend((order.Phone, OrderMessages.ClientConfirmation(order, paymentPhone)));
        foreach (var (phone, text) in messages)
        {
            try
            {
                await whatsApp.SendAsync(phone, text, CancellationToken.None);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "WhatsApp message for order {OrderId} to {Phone} failed", order.Id, phone);
            }
        }
    }
}
