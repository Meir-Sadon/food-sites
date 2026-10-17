using System.Collections.Concurrent;
using FoodSite.Api.Marketing;

namespace FoodSite.Api.Tests;

/// <summary>Records every event meant for Meta's Conversions API instead of sending it.</summary>
public class CapturingMetaSender : IMetaConversionsSender
{
    public ConcurrentQueue<MetaPurchase> Sent { get; } = new();

    public bool Fail { get; set; }

    public Task SendPurchaseAsync(MetaPurchase purchase, CancellationToken ct = default)
    {
        if (Fail)
            throw new HttpRequestException("Meta is down");
        Sent.Enqueue(purchase);
        return Task.CompletedTask;
    }
}
