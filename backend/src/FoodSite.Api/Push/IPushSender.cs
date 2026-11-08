namespace FoodSite.Api.Push;

public interface IPushSender
{
    /// <summary>An emergency alert that repeats until the person acknowledges it on the phone.</summary>
    Task SendAsync(string userKey, string? sound, string title, string message, string? url, CancellationToken ct = default);
}

/// <summary>Used while Pushover is not set up: nothing leaves the server.</summary>
public class NoopPushSender : IPushSender
{
    public Task SendAsync(string userKey, string? sound, string title, string message, string? url, CancellationToken ct = default) =>
        Task.CompletedTask;
}
