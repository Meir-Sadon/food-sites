namespace FoodSite.Api.Messaging;

/// <summary>The two message templates Meta approves (see docs/PLAN.md).</summary>
public enum WhatsAppTemplate
{
    OrderConfirmation,
    NewOrder,
}

public interface IWhatsAppSender
{
    /// <summary>Sends a message to a phone in local form ("0501234567"). Throws when sending fails.</summary>
    Task SendAsync(string phone, WhatsAppTemplate template, string message, CancellationToken ct = default);
}

/// <summary>
/// Used when the WhatsApp Cloud API is not configured: the message is written to the log instead of being sent.
/// </summary>
public class SimulatedWhatsAppSender(ILogger<SimulatedWhatsAppSender> logger) : IWhatsAppSender
{
    public Task SendAsync(string phone, WhatsAppTemplate template, string message, CancellationToken ct = default)
    {
        logger.LogInformation("WhatsApp (simulated, {Template}) to {Phone}:\n{Message}", template, phone, message);
        return Task.CompletedTask;
    }
}
