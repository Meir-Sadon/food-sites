using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Mail;
using FoodSite.Api.Messaging;
using FoodSite.Api.Push;
using FoodSite.Api.Sites;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace FoodSite.Api.Orders;

/// <summary>
/// Tells the client and everyone on the admin's list about a new order. A failed message never fails the
/// order: it is already saved and shows in the admin's Orders tab.
/// </summary>
public class OrderNotifier(
    AppDbContext db,
    IWhatsAppSender whatsApp,
    ISmsSender sms,
    IOptions<SmsOptions> smsOptions,
    OwnerNotifier ownerMail,
    PushNotifier pushNotifier,
    IOptions<SiteOptions> site,
    FeatureFlags features,
    ILogger<OrderNotifier> logger)
{
    /// <param name="origin">Scheme and host of this request, for the link to the order in the owner's mail and alerts.</param>
    public async Task NotifyAsync(
        Order order, string? paymentPhone, string? ownerEmail, IReadOnlyList<string> serviceCities, bool hourFull, string origin, CancellationToken ct)
    {
        await ownerMail.NewOrderAsync(ownerEmail, order, hourFull, $"{origin}/admin/orders/{order.Id}",
            await features.IsEnabledAsync(Features.PriceLists, ct));
        var recipients = await db.NotifyPhones.AsNoTracking().OrderBy(p => p.DisplayOrder).ThenBy(p => p.Id).ToListAsync(CancellationToken.None);
        await pushNotifier.NewOrderAsync(recipients, order, site.Value.Name, $"{origin}/admin/orders/{order.Id}");
        var messages = recipients.Select(p => p.Phone)
            .Select(phone => (phone, WhatsAppTemplate.NewOrder, text: OrderMessages.AdminNotification(order, site.Value.Name, hourFull)))
            .Prepend((order.Phone, WhatsAppTemplate.OrderConfirmation, OrderMessages.ClientConfirmation(order, paymentPhone, site.Value.Name, serviceCities, hourFull)));
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

        try
        {
            await sms.SendAsync(order.Phone, SmsMessages.Confirmation(order, site.Value.Name, smsOptions.Value.ConfirmationTemplate), CancellationToken.None);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "SMS for order {OrderId} to {Phone} failed", order.Id, order.Phone);
        }
    }
}
