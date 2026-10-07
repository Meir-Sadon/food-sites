using FoodSite.Api.Controllers.Admin;
using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Messaging;
using FoodSite.Api.Orders;
using FoodSite.Api.Phones;
using FoodSite.Api.Sites;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using static FoodSite.Api.Controllers.Admin.Ordering;

namespace FoodSite.Api.Controllers;

[Route("api/orders")]
[EnableRateLimiting(PublicControllerBase.WriteRateLimitPolicy)]
public class OrdersController(
    AppDbContext db,
    SiteClock clock,
    IWhatsAppSender whatsApp,
    IOptions<SiteOptions> site,
    ILogger<OrdersController> logger) : PublicControllerBase
{
    public const int NameMaxLength = 100;
    public const int NotesMaxLength = 500;

    public record OrderInput(
        string? Phone,
        string? Name,
        string? City,
        string? Street,
        string? HouseNumber,
        string? Apartment,
        DateOnly SupplyDate,
        FulfillmentMethod FulfillmentMethod,
        PaymentMethod PaymentMethod,
        string? Notes,
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
        bool NeedsReview,
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
            errors.Text(nameof(input.City), input.City, AddressFormat.PartMaxLength, required: true);
            errors.Text(nameof(input.Street), input.Street, AddressFormat.PartMaxLength, required: true);
            errors.Text(nameof(input.HouseNumber), input.HouseNumber, AddressFormat.PartMaxLength, required: true);
            errors.Text(nameof(input.Apartment), input.Apartment, AddressFormat.PartMaxLength);
        }
        else
        {
            if (!settings.PickupEnabled) errors.Add(nameof(input.FulfillmentMethod), "fulfillmentUnavailable");
            errors.Text(nameof(input.City), input.City, AddressFormat.PartMaxLength);
            errors.Text(nameof(input.Street), input.Street, AddressFormat.PartMaxLength);
            errors.Text(nameof(input.HouseNumber), input.HouseNumber, AddressFormat.PartMaxLength);
            errors.Text(nameof(input.Apartment), input.Apartment, AddressFormat.PartMaxLength);
        }

        if (!Enum.IsDefined(input.PaymentMethod))
            errors.Add(nameof(input.PaymentMethod), "invalid");
        else if (input.PaymentMethod == PaymentMethod.Transfer && string.IsNullOrWhiteSpace(settings.PaymentPhone))
            errors.Add(nameof(input.PaymentMethod), "paymentUnavailable");

        var days = await db.SupplyDays.AsNoTracking().ToListAsync(ct);
        var closed = await db.ClosedDates.AsNoTracking().Select(c => c.Date).ToListAsync(ct);
        if (!SupplyCalendar.IsOpen(input.SupplyDate, clock.NowLocal(), days, closed))
            errors.Add(nameof(input.SupplyDate), "supplyDateUnavailable");

        var ids = (input.Items ?? [])
            .SelectMany(i => (i.AddOns ?? []).Select(a => a.DishId).Append(i.DishId))
            .Distinct().ToList();
        var dishes = await db.Dishes
            .Include(d => d.Category).Include(d => d.Options).Include(d => d.AddOns)
            .AsSplitQuery()
            .Where(d => ids.Contains(d.Id))
            .ToDictionaryAsync(d => d.Id, ct);
        var items = OrderBuilder.Build(input.Items, dishes, errors);
        if (!errors.Any && settings.MinimumOrderAmount is { } minimum && OrderBuilder.Total(items) < minimum)
            errors.Add("items", "belowMinimumOrder");
        if (!errors.Any)
            await CheckDishLimitsAsync(input.SupplyDate, items, dishes, errors, ct);

        if (errors.Any)
            return Invalid(errors);

        // The order is added to that phone's account, if there is one.
        var userId = await db.Users.AsNoTracking().Where(u => u.Phone == phone).Select(u => (int?)u.Id).FirstOrDefaultAsync(ct);

        var order = new Order
        {
            UserId = userId,
            Phone = phone!,
            Name = input.Name!.Trim(),
            Address = AddressFormat.Compose(input.City, input.Street, input.HouseNumber, input.Apartment),
            SupplyDate = input.SupplyDate,
            FulfillmentMethod = input.FulfillmentMethod,
            Notes = Clean(input.Notes),
            PaymentMethod = input.PaymentMethod,
            Status = OrderStatus.New,
            NeedsReview = input.FulfillmentMethod == FulfillmentMethod.Delivery && !AddressFormat.IsServiceCity(input.City),
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
            order.NeedsReview,
            order.Items
                .Select(i => new ConfirmationItemDto(i.DishName, i.OptionLabel, i.Quantity, i.UnitPrice, i.LineTotal, i.ParentItem is not null))
                .ToList());
    }

    /// <summary>
    /// A dish with a per-supply-date limit can only be ordered until the orders already placed
    /// for that date (cancelled ones and ones waiting for approval excluded) plus this one would pass it.
    /// </summary>
    private async Task CheckDishLimitsAsync(
        DateOnly supplyDate, List<OrderItem> items, Dictionary<int, Dish> dishes, Errors errors, CancellationToken ct)
    {
        var limited = items.Select(i => i.DishId).Distinct()
            .Where(id => dishes[id].MaxPerSupplyDate is not null).ToList();
        if (limited.Count == 0)
            return;

        var taken = await db.OrderItems.AsNoTracking()
            .Where(i => limited.Contains(i.DishId) && i.Order!.SupplyDate == supplyDate && i.Order.Status != OrderStatus.Cancelled && !i.Order.NeedsReview)
            .GroupBy(i => i.DishId)
            .Select(g => new { DishId = g.Key, Quantity = g.Sum(i => i.Quantity) })
            .ToDictionaryAsync(g => g.DishId, g => g.Quantity, ct);

        foreach (var id in limited)
        {
            var requested = items.Where(i => i.DishId == id).Sum(i => i.Quantity);
            if (taken.GetValueOrDefault(id) + requested > dishes[id].MaxPerSupplyDate)
            {
                errors.Add("items", "dishLimitReached");
                return;
            }
        }
    }

    /// <summary>
    /// Tells the client and everyone on the admin's list. A failed message never fails the
    /// order: it is already saved and shows in the admin's Orders tab.
    /// </summary>
    private async Task NotifyAsync(Order order, string? paymentPhone, CancellationToken ct)
    {
        var admins = await db.NotifyPhones.AsNoTracking().Select(p => p.Phone).ToListAsync(CancellationToken.None);
        var messages = admins
            .Select(phone => (phone, WhatsAppTemplate.NewOrder, text: OrderMessages.AdminNotification(order, site.Value.Name)))
            .Prepend((order.Phone, WhatsAppTemplate.OrderConfirmation, OrderMessages.ClientConfirmation(order, paymentPhone, site.Value.Name)));
        foreach (var (phone, template, text) in messages)
        {
            try
            {
                await whatsApp.SendAsync(phone, template, text, CancellationToken.None);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "WhatsApp message for order {OrderId} to {Phone} failed", order.Id, phone);
            }
        }
    }
}
