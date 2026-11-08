using FoodSite.Api.Data.Entities;
using Microsoft.Extensions.Options;

namespace FoodSite.Api.Push;

/// <summary>Alerts every notify phone that has a Pushover key about a new order. A failed alert never fails the order.</summary>
public class PushNotifier(IPushSender sender, IOptions<PushoverOptions> options, ILogger<PushNotifier> logger)
{
    public async Task NewOrderAsync(IEnumerable<NotifyPhone> recipients, Order order, string? siteName, string? adminUrl)
    {
        if (!options.Value.IsConfigured)
            return;
        var title = string.IsNullOrWhiteSpace(siteName) ? "הזמנה חדשה" : $"הזמנה חדשה · {siteName.Trim()}";
        var message = $"הזמנה #{order.Id} מ{order.Name} · {order.Total:0.##} ₪";
        foreach (var recipient in recipients.Where(r => !string.IsNullOrWhiteSpace(r.PushoverKey)))
        {
            try
            {
                await sender.SendAsync(recipient.PushoverKey!, recipient.PushoverSound, title, message, adminUrl, CancellationToken.None);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Pushover alert for order {OrderId} to {Phone} failed", order.Id, recipient.Phone);
            }
        }
    }
}
