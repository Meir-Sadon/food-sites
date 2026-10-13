namespace FoodSite.Api.Mail;

public interface IMailer
{
    /// <summary>Sends one mail. Throws when sending fails.</summary>
    Task SendAsync(string to, string subject, string html, string text, CancellationToken ct = default);
}

/// <summary>Used while no mail key is configured: nothing is sent, so a site without one keeps working.</summary>
public class NoopMailer(ILogger<NoopMailer> logger) : IMailer
{
    public Task SendAsync(string to, string subject, string html, string text, CancellationToken ct = default)
    {
        logger.LogInformation("Mail (not configured, not sent) to {To}: {Subject}", to, subject);
        return Task.CompletedTask;
    }
}
