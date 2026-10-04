namespace Kuskus.Api.Messaging;

public interface IWhatsAppSender
{
    /// <summary>Sends a message to a phone in local form ("0501234567"). Throws when sending fails.</summary>
    Task SendAsync(string phone, string message, CancellationToken ct = default);
}

/// <summary>
/// Stands in for the WhatsApp Cloud API until Meta approves the message templates:
/// the message is written to the log instead of being sent.
/// </summary>
public class SimulatedWhatsAppSender(ILogger<SimulatedWhatsAppSender> logger) : IWhatsAppSender
{
    public Task SendAsync(string phone, string message, CancellationToken ct = default)
    {
        logger.LogInformation("WhatsApp (simulated) to {Phone}:\n{Message}", phone, message);
        return Task.CompletedTask;
    }
}
