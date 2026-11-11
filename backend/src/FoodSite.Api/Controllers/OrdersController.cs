using FoodSite.Api.Controllers.Admin;
using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Delivery;
using FoodSite.Api.Mail;
using FoodSite.Api.Messaging;
using FoodSite.Api.Marketing;
using FoodSite.Api.Orders;
using FoodSite.Api.Payments;
using FoodSite.Api.Phones;
using FoodSite.Api.Push;
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
    OrderNotifier notifier,
    MarketingNotifier marketing,
    DeliveryQuoter deliveryQuoter,
    FeatureFlags features,
    ICardGateway cardGateway,
    CardLinks cardLinks,
    ILogger<OrdersController> logger) : PublicControllerBase
{
    public const int NameMaxLength = 100;
    public const int NotesMaxLength = 500;

    /// <summary>The most a client may tip on one order (₪).</summary>
    public const decimal MaxTip = 1000m;

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
        List<OrderLineInput>? Items,
        TimeOnly? DeliveryHour = null,
        DateOnly? DeliveryHourDate = null,
        MarketingInput? Marketing = null,
        bool AcceptMinimumTopUp = false,
        decimal? Tip = null,
        string? BuildingType = null,
        string? BuildingOther = null);

    public record ConfirmationItemDto(
        string DishName, string? OptionLabel, decimal Quantity, decimal UnitPrice, decimal LineTotal, bool IsAddOn, string? AllergenInfo = null,
        decimal? RegularUnitPrice = null);

    public record ConfirmationDto(
        int Id,
        DateOnly SupplyDate,
        FulfillmentMethod FulfillmentMethod,
        PaymentMethod PaymentMethod,
        decimal Total,
        string? PaymentPhone,
        string? PaymentLink,
        bool NeedsReview,
        IReadOnlyList<ConfirmationItemDto> Items,
        TimeOnly? DeliveryHour = null,
        bool HourFull = false,
        decimal DeliveryFee = 0m,
        decimal DeliveryDiscount = 0m,
        decimal MinimumTopUp = 0m,
        decimal Tip = 0m,
        TimeOnly? DeliveryHourEnd = null,
        /// <summary>For a credit card order: the clearing company's payment page the client is sent to. The order only counts once it is paid.</summary>
        string? PayUrl = null);

    [HttpPost]
    public async Task<ActionResult<ConfirmationDto>> Create(OrderInput input, CancellationToken ct)
    {
        var errors = new Errors();
        var settings = await db.Settings.AsNoTracking().SingleAsync(ct);

        // In emergency mode the site takes no orders: clients phone instead.
        if (settings.EmergencyEnabled)
        {
            errors.Add("emergency", "emergencyMode");
            return Invalid(errors);
        }

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
            AddressFormat.ValidateBuilding(errors, input.BuildingType, input.BuildingOther, nameof(input.BuildingType), nameof(input.BuildingOther));
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
        else if (input.PaymentMethod.IsTransfer() && !TransferAvailable(settings, input.PaymentMethod))
            errors.Add(nameof(input.PaymentMethod), "paymentUnavailable");
        else if (input.PaymentMethod == PaymentMethod.CreditCard && !(cardGateway.IsConfigured && await features.IsEnabledAsync(Features.CardPayments, ct)))
            errors.Add(nameof(input.PaymentMethod), "paymentUnavailable");

        var days = await db.SupplyDays.AsNoTracking().Include(d => d.Hours).ToListAsync(ct);
        var closed = await db.ClosedDates.AsNoTracking().Select(c => c.Date).ToListAsync(ct);
        var openDate = SupplyCalendar.Find(input.SupplyDate, clock.NowLocal(), days, closed, await ShabbatSchedule.LoadAsync(db, clock, ct), SlotTiming.Of(settings));
        if (openDate is null)
            errors.Add(nameof(input.SupplyDate), "supplyDateUnavailable");
        // A day with supply hours needs one of them; on a day without, any hour sent is dropped.
        var hour = openDate is { Hours.Count: > 0 } ? input.DeliveryHour : null;
        // A slot after midnight that continues the day's shift belongs to the next date, which is where the order is saved.
        var supplyDate = input.SupplyDate;
        SupplyCalendar.HourSlot? chosenSlot = null;
        if (openDate is { Hours.Count: > 0 })
        {
            var slotDate = input.DeliveryHourDate ?? input.SupplyDate;
            var delivery = input.FulfillmentMethod == FulfillmentMethod.Delivery;
            if (input.DeliveryHour is null)
                errors.Add(nameof(input.DeliveryHour), "required");
            else if (openDate.Hours.FirstOrDefault(h => h.From == input.DeliveryHour && (h.Date ?? input.SupplyDate) == slotDate && (delivery ? h.DeliveryOk : h.PickupOk)) is not { } found)
                errors.Add(nameof(input.DeliveryHour), "deliveryHourUnavailable");
            else
            {
                supplyDate = slotDate;
                chosenSlot = found;
            }
        }

        var ids = (input.Items ?? [])
            .SelectMany(i => (i.AddOns ?? []).Concat((i.AddOnUnits ?? []).SelectMany(u => u.AddOns ?? [])).Select(a => a.DishId).Append(i.DishId))
            .Distinct().ToList();
        var dishes = await db.Dishes
            .Include(d => d.Category).Include(d => d.Options).Include(d => d.Questions).Include(d => d.AddOns).ThenInclude(a => a.Group)
            .Include(d => d.AvailabilityRules)
            .Include(d => d.MainDish).ThenInclude(m => m!.AvailabilityRules)
            .Include(d => d.MainDish).ThenInclude(m => m!.Options)
            .Include(d => d.MainDish).ThenInclude(m => m!.Questions)
            .Include(d => d.MainDish).ThenInclude(m => m!.AddOns).ThenInclude(a => a.Group)
            .AsSplitQuery()
            .Where(d => ids.Contains(d.Id))
            .ToDictionaryAsync(d => d.Id, ct);
        // The slot the client picked (the day itself when it has no hours), which decides what is sold.
        var pickedSlot = chosenSlot;
        var prices = await SessionPricesAsync(db, features, clock, ct);
        var items = OrderBuilder.Build(input.Items, dishes, errors, openDate is null ? null : DishAvailability.Of(supplyDate, pickedSlot), prices);
        var minimumApplies = input.FulfillmentMethod == FulfillmentMethod.Delivery || settings.MinimumOrderAppliesToPickup;
        // An order under the minimum is only sent when the client agreed to be charged the minimum.
        var minimumTopUp = 0m;
        // A tip is the client's own choice, only while the admin has tips on; the amount is never negative.
        var tip = 0m;
        if (input.Tip is { } tipInput && tipInput != 0m)
        {
            if (!settings.TipsEnabled)
                errors.Add(nameof(input.Tip), "tipUnavailable");
            else if (tipInput < 0m || tipInput > MaxTip)
                errors.Add(nameof(input.Tip), "invalid");
            else
                tip = decimal.Round(tipInput, 2);
        }
        if (!errors.Any && minimumApplies && settings.MinimumOrderAmount is { } minimum && OrderBuilder.Total(items) < minimum)
        {
            if (input.AcceptMinimumTopUp)
                minimumTopUp = minimum - OrderBuilder.Total(items);
            else
                errors.Add("items", "belowMinimumOrder");
        }
        if (!errors.Any)
            await CheckDishLimitsAsync(supplyDate, items, dishes, errors, ct);
        if (!errors.Any && settings.PortionsPerSupplyDate is { } portions)
            await CheckPortionLimitAsync(supplyDate, items, dishes, portions, errors, ct);

        // The fee comes from the address, worked out here again so a quote the client saw cannot be changed.
        var quote = input.FulfillmentMethod == FulfillmentMethod.Delivery && !errors.Any
            ? await deliveryQuoter.QuoteAsync(settings, input.City, input.Street, input.HouseNumber, ct)
            : null;
        if (quote?.Status == DeliveryQuote.Blocked)
            errors.Add(nameof(input.City), "deliveryNotAvailable");

        if (errors.Any)
            return Invalid(errors);

        // A full hour is still taken: the client was told the admin may call to move it.
        var hourFull = false;
        if (hour is { } slot)
        {
            var (deliveries, pickups) = await HourCapacity.CountAsync(db.Orders.AsNoTracking(), supplyDate, chosenSlot?.Group ?? slot, ct);
            hourFull = HourCapacity.IsFull(HourCapacity.LimitsOf(settings), input.FulfillmentMethod, deliveries, pickups);
            // A pickup at a finer time also has the limit of its own finer slot.
            if (!hourFull && chosenSlot?.Group is not null && settings.OrdersPerPickupSlot is { } fineLimit)
                hourFull = HourCapacity.IsFineFull(fineLimit, await HourCapacity.CountFineAsync(db.Orders.AsNoTracking(), supplyDate, slot, ct));
        }

        // The order is added to that phone's account, if there is one.
        var userId = await db.Users.AsNoTracking().Where(u => u.Phone == phone).Select(u => (int?)u.Id).FirstOrDefaultAsync(ct);

        // With zones there is no list of cities: a client who waits for approval waits because the map could not place the address.
        var serviceCities = DeliveryQuoter.Mode(settings) == DeliveryPricing.Zones ? (IReadOnlyList<string>)[] : ServiceArea.Parse(settings.ServiceCities);
        var dishesTotal = OrderBuilder.Total(items);
        // An address nobody could price pays the minimum fee, and the order waits while the owner phones about any extra.
        var fee = quote switch
        {
            { Status: DeliveryQuote.Ok } => quote.Fee,
            { Status: DeliveryQuote.Outside or DeliveryQuote.Unknown } => await deliveryQuoter.MinimumFeeAsync(settings, ct),
            _ => 0m,
        };
        var discount = DeliveryDiscount.Amount(settings, dishesTotal, fee);
        var order = new Order
        {
            UserId = userId,
            Phone = phone!,
            Name = input.Name!.Trim(),
            Address = AddressFormat.Compose(input.City, input.Street, input.HouseNumber, input.Apartment, input.BuildingType, input.BuildingOther),
            SupplyDate = supplyDate,
            DeliveryHour = hour,
            DeliveryHourEnd = hour is null ? null : chosenSlot?.To,
            CapacityHour = chosenSlot?.Group,
            FulfillmentMethod = input.FulfillmentMethod,
            Notes = Clean(input.Notes),
            // An older page still sends the combined "Transfer": it becomes whichever service is on.
            PaymentMethod = input.PaymentMethod == PaymentMethod.Transfer
                ? (settings.BitEnabled ? PaymentMethod.Bit : PaymentMethod.PayBox)
                : input.PaymentMethod,
            Status = OrderStatus.New,
            // An address the map could not place waits for the admin, like a city outside the service area.
            NeedsReview = input.FulfillmentMethod == FulfillmentMethod.Delivery
                && (quote is null or { Status: DeliveryQuote.Outside or DeliveryQuote.Unknown } or { Approximate: true }),
            DeliveryFee = fee - discount,
            DeliveryDiscount = discount,
            // Admin-only: a big order waits for its deposit and the client is told nothing about it.
            DepositRequired = settings.DepositMinOrder is > 0m && dishesTotal + minimumTopUp + fee - discount > settings.DepositMinOrder,
            DeliveryZoneName = quote is { Status: DeliveryQuote.Ok } ? quote.ZoneName : null,
            MinimumTopUp = minimumTopUp,
            Tip = tip,
            Total = dishesTotal + minimumTopUp + fee - discount + tip,
            CreatedAt = DateTimeOffset.UtcNow,
            PlacedByOwner = await SessionOpenedByOwnerAsync(),
        };
        foreach (var item in items)
            order.Items.Add(item);
        db.Orders.Add(order);
        // A one-time discount that priced this order is now used up (until the order is cancelled).
        if (await SessionUserIdAsync() is { } discountUserId)
            foreach (var listId in await PriceBook.OneTimeDiscountsUsedAsync(
                db, discountUserId, clock.Today(), items.SelectMany(i => i.AddOnItems.Prepend(i)).Select(i => i.PriceListName), ct))
                order.DiscountUses.Add(new PriceListDiscountUse { PriceListId = listId, UserId = discountUserId });
        // The order in progress the client kept on the server is now sent (a card order: once the payment page is open).
        var cardOrder = order.PaymentMethod == PaymentMethod.CreditCard;
        if (!cardOrder)
            await RemoveSavedCartAsync(ct);
        await db.SaveChangesAsync(ct);

        // A card order is saved first (the clearing company needs its number) but nobody is told until it is paid.
        string? payUrl = null;
        if (cardOrder)
        {
            var origin = $"{Request.Scheme}://{Request.Host}";
            try
            {
                var page = await cardGateway.CreatePageAsync(
                    new CardPageRequest(order.Id, order.Total, order.Name, order.Phone, $"הזמנה #{order.Id}", cardLinks.ReturnUrl(origin, order.Id), cardLinks.CallbackUrl(origin, order.Id)), ct);
                order.CardTraceId = page.TraceId;
                payUrl = page.Url;
            }
            catch (CardGatewayException ex)
            {
                logger.LogError(ex, "Opening the card payment page for order {OrderId} failed", order.Id);
                // Nothing was charged and the client was told nothing: the order is taken back so it is not left unpaid in the admin's list.
                db.Orders.Remove(order);
                await db.SaveChangesAsync(CancellationToken.None);
                return Invalid(nameof(input.PaymentMethod), "cardPaymentFailed");
            }
            await RemoveSavedCartAsync(ct);
            await db.SaveChangesAsync(ct);
        }
        else
            await notifier.NotifyAsync(order, settings.PaymentPhone, settings.OwnerEmail, serviceCities, hourFull, $"{Request.Scheme}://{Request.Host}", ct);
        // An order the owner keyed in for a client is not a purchase on the client's device: it stays out of ad conversions.
        if (!order.PlacedByOwner && !cardOrder)
            await marketing.PurchaseAsync(settings, order, input.Marketing, HttpContext.Connection.RemoteIpAddress?.ToString(), Request.Headers.UserAgent.ToString(), CancellationToken.None);

        return new ConfirmationDto(
            order.Id, order.SupplyDate, order.FulfillmentMethod, order.PaymentMethod, order.Total,
            order.PaymentMethod.IsTransfer() ? settings.PaymentPhone : null,
            order.PaymentMethod switch { PaymentMethod.Bit => settings.BitLink, PaymentMethod.PayBox => settings.PayBoxLink, _ => null },
            order.NeedsReview,
            order.Items
                .Select(i => new ConfirmationItemDto(i.DishName, i.OptionLabel, i.Quantity, i.UnitPrice, i.LineTotal, i.ParentItem is not null, i.Dish?.AllergenInfo, i.RegularUnitPrice))
                .ToList(),
            order.DeliveryHour,
            hourFull,
            order.DeliveryFee,
            order.DeliveryDiscount,
            order.MinimumTopUp,
            order.Tip,
            order.DeliveryHourEnd,
            payUrl);
    }

    private async Task RemoveSavedCartAsync(CancellationToken ct)
    {
        if (await SessionUserIdAsync() is { } sessionUserId
            && await db.SavedCarts.SingleOrDefaultAsync(c => c.UserId == sessionUserId, ct) is { } cart)
            db.SavedCarts.Remove(cart);
    }

    /// <summary>A manual payment needs the business's number and that service switched on.</summary>
    private static bool TransferAvailable(Settings settings, PaymentMethod method) =>
        !string.IsNullOrWhiteSpace(settings.PaymentPhone) && method switch
        {
            PaymentMethod.Bit => settings.BitEnabled,
            PaymentMethod.PayBox => settings.PayBoxEnabled,
            _ => settings.BitEnabled || settings.PayBoxEnabled,
        };

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
            .Where(i => limited.Contains(i.DishId) && i.Order!.SupplyDate == supplyDate && i.Order.Status != OrderStatus.Cancelled && !i.Order.NeedsReview && !(i.Order.DepositRequired && !i.Order.DepositPaid))
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

    /// <summary>The site's portions per supply date are shared by all dishes, so the whole order has to fit in what is left.</summary>
    private async Task CheckPortionLimitAsync(
        DateOnly supplyDate, List<OrderItem> items, Dictionary<int, Dish> dishes, int portions, Errors errors, CancellationToken ct)
    {
        var requested = items.SelectMany(i => i.AddOnItems.Prepend(i))
            .Where(i => DailyPortions.Counts(dishes[i.DishId])).Sum(i => i.Quantity);
        if (requested == 0)
            return;

        var taken = (await DailyPortions.TakenAsync(db, [supplyDate], ct)).GetValueOrDefault(supplyDate);
        if (taken + requested > portions)
            errors.Add("items", "portionLimitReached");
    }
}
