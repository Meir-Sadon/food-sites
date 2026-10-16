using FoodSite.Api.Data.Entities;
using FoodSite.Api.Sites;
using Microsoft.Extensions.Options;

namespace FoodSite.Api.Mail;

/// <summary>Mails the business owner (Settings → owner mail address). With no address, nothing is sent.</summary>
public class OwnerNotifier(IMailer mailer, IOptions<SiteOptions> site, ILogger<OwnerNotifier> logger)
{
    /// <summary>A failed mail never fails the order: it is already saved and shows in the admin's Orders tab.</summary>
    public async Task NewOrderAsync(string? ownerEmail, Order order, bool hourFull, string? adminUrl = null)
    {
        if (string.IsNullOrWhiteSpace(ownerEmail))
            return;
        foreach (var to in OwnerRecipients.Split(ownerEmail))
            await SendAsync(to, OwnerMessages.NewOrder(order, site.Value.Name, hourFull, adminUrl), $"order {order.Id}");
    }

    /// <summary>Only when the admin ticked "mail about changes"; it is off by default.</summary>
    public async Task ChangesAsync(string? ownerEmail, bool enabled, IReadOnlyList<AuditEntry> entries, CancellationToken ct)
    {
        if (!enabled || string.IsNullOrWhiteSpace(ownerEmail) || entries.Count == 0)
            return;
        var mail = OwnerMessages.Changes(entries, site.Value.Name);
        foreach (var to in OwnerRecipients.Split(ownerEmail))
            await SendAsync(to, mail, "changes", ct);
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
