using FoodSite.Api.Payments;

namespace FoodSite.Api.Tests;

/// <summary>Stands in for Invoice4U: opens a fake payment page and finds only the charges a test adds.</summary>
public class FakeCardGateway : ICardGateway
{
    public bool IsConfigured { get; set; } = true;

    /// <summary>The next page request fails, as when Invoice4U is down or rejects the key.</summary>
    public bool FailPages { get; set; }

    public List<CardPageRequest> Pages { get; } = [];

    /// <summary>Charges the clearing log would show, by the payment id the callback reports.</summary>
    public Dictionary<string, CardCharge> Charges { get; } = [];

    public Task<CardPage> CreatePageAsync(CardPageRequest request, CancellationToken ct)
    {
        if (FailPages)
            throw new CardGatewayException("down");
        Pages.Add(request);
        return Task.FromResult(new CardPage($"https://pay.example.test/page/{request.OrderId}", $"trace-{request.OrderId}"));
    }

    public Task<CardCharge?> FindChargeAsync(string? paymentId, string? traceId, CancellationToken ct) =>
        Task.FromResult(Charges.TryGetValue(paymentId ?? traceId ?? "", out var charge) ? charge : null);
}
