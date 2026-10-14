using System.Collections.Concurrent;
using FoodSite.Api.Messaging;

namespace FoodSite.Api.Tests;

public class CapturingSmsSender : ISmsSender
{
    public ConcurrentQueue<(string Phone, string Message)> Sent { get; } = new();

    public bool Fail { get; set; }

    public Task SendAsync(string phone, string message, CancellationToken ct = default)
    {
        if (Fail)
            throw new InvalidOperationException("SMS is down");
        Sent.Enqueue((phone, message));
        return Task.CompletedTask;
    }
}
