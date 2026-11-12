using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Delivery;
using FoodSite.Api.Orders;
using Microsoft.EntityFrameworkCore;

namespace FoodSite.Api.Payments;

/// <summary>
/// Marks a card order paid once the clearing company's own log shows the charge, and only then tells the owner and
/// the client about the order. Used by the clearing company's callback and by the return page, whichever comes first.
/// </summary>
public class CardSettlement(AppDbContext db, ICardGateway gateway, OrderNotifier notifier, ILogger<CardSettlement> logger)
{
    /// <returns>Whether the order is paid now (also when it already was).</returns>
    public async Task<bool> TryConfirmAsync(Order order, string? paymentId, string origin, CancellationToken ct)
    {
        if (order.PaymentMethod != PaymentMethod.CreditCard)
            return false;
        if (order.IsPaid)
            return true;

        var charge = await gateway.FindChargeAsync(paymentId, order.CardTraceId, ct);
        if (charge is null)
            return false;
        if (Math.Abs(charge.Amount - order.Total) > 0.005m)
        {
            logger.LogWarning("Card charge for order {OrderId} is {Charged} but the order is {Total}: not marked paid", order.Id, charge.Amount, order.Total);
            return false;
        }

        // Only the call that flips IsPaid goes on to send the messages, so a callback and the return page cannot both do it.
        var claimed = await db.Orders.Where(o => o.Id == order.Id && !o.IsPaid).ExecuteUpdateAsync(set => set
            .SetProperty(o => o.IsPaid, true)
            .SetProperty(o => o.PaidWith, (PaidWith?)PaidWith.CreditCard)
            .SetProperty(o => o.CardPaymentId, charge.PaymentId ?? paymentId)
            .SetProperty(o => o.CardConfirmation, charge.ConfirmationNumber)
            .SetProperty(o => o.PaymentComment, charge.Installments > 1 ? $"אשראי, {charge.Installments} תשלומים" : "אשראי"), ct);
        if (claimed == 0)
            return true;

        order.IsPaid = true;
        order.PaidWith = PaidWith.CreditCard;
        var settings = await db.Settings.AsNoTracking().SingleAsync(ct);
        var serviceCities = DeliveryQuoter.Mode(settings) == DeliveryPricing.Zones ? (IReadOnlyList<string>)[] : ServiceArea.Parse(settings.ServiceCities);
        await notifier.NotifyAsync(order, settings.PaymentPhone, settings.OwnerEmail, serviceCities, false, origin, CancellationToken.None);
        return true;
    }
}
