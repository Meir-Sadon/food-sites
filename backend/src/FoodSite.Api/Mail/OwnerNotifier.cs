using FoodSite.Api.Data.Entities;
using FoodSite.Api.Sites;
using Microsoft.Extensions.Options;

namespace FoodSite.Api.Mail;

/// <summary>Mails the business owner (Settings → owner mail address). With no address, nothing is sent.</summary>
public class OwnerNotifier(IMailer mailer, IOptions<SiteOptions> site, ILogger<OwnerNotifier> logger)
{
    /// <summary>A failed mail never fails the order: it is already saved and shows in the admin's Orders tab.</summary>
    public async Task NewOrderAsync(string? ownerEmail, Order order, bool hourFull)
    {
        if (string.IsNullOrWhiteSpace(ownerEmail))
            return;
        await SendAsync(ownerEmail, OwnerMessages.NewOrder(order, site.Value.Name, hourFull), $"order {order.Id}");
    }

    public Task ChangesAsync(string? ownerEmail, IReadOnlyList<AuditEntry> entries, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(ownerEmail) || entries.Count == 0)
            return Task.CompletedTask;
        return SendAsync(ownerEmail, OwnerMessages.Changes(entries, site.Value.Name), "changes", ct);
    }

    private async Task SendAsync(string to, OwnerMail mail, string what, CancellationToken ct = default)
    {
        try
        {
            await mailer.SendAsync(to, mail.Subject, mail.Html, mail.Text, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Mail for {What} to the owner failed", what);
        }
    }
}
