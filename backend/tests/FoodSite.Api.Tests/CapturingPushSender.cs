using System.Collections.Concurrent;
using FoodSite.Api.Push;

namespace FoodSite.Api.Tests;

public class CapturingPushSender : IPushSender
{
    public ConcurrentQueue<(string UserKey, string? Sound, string Title, string Message, string? Url)> Sent { get; } = new();

    /// <summary>User keys whose alerts fail, to test that orders survive a Pushover outage.</summary>
    public HashSet<string> FailFor { get; } = [];

    public Task SendAsync(string userKey, string? sound, string title, string message, string? url, CancellationToken ct = default)
    {
        if (FailFor.Contains(userKey))
            throw new InvalidOperationException("Pushover is down");
        Sent.Enqueue((userKey, sound, title, message, url));
        return Task.CompletedTask;
    }
}
