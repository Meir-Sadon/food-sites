namespace FoodSite.Api.Messaging;

public interface ISmsSender
{
    /// <summary>Sends a text message to a phone in local form ("0501234567"). Throws when sending fails.</summary>
    Task SendAsync(string phone, string message, CancellationToken ct = default);
}

/// <summary>Used when SMS is not configured: the message is written to the log instead of being sent.</summary>
public class SimulatedSmsSender(ILogger<SimulatedSmsSender> logger) : ISmsSender
{
    public Task SendAsync(string phone, string message, CancellationToken ct = default)
    {
        logger.LogInformation("SMS (simulated) to {Phone}:\n{Message}", phone, message);
        return Task.CompletedTask;
    }
}
