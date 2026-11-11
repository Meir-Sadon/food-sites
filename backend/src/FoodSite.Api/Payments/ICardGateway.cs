namespace FoodSite.Api.Payments;

/// <summary>What the clearing company needs to open a hosted payment page for one order.</summary>
public record CardPageRequest(
    int OrderId, decimal Amount, string Name, string Phone, string Description, string ReturnUrl, string CallBackUrl);

/// <summary>A hosted payment page: the client is sent to <see cref="Url"/>; <see cref="TraceId"/> is the clearing company's id for it.</summary>
public record CardPage(string Url, string? TraceId);

/// <summary>A successful, non-credit charge found in the clearing company's own log.</summary>
public record CardCharge(string? PaymentId, decimal Amount, string? ConfirmationNumber, int Installments);

public class CardGatewayException(string message, Exception? inner = null) : Exception(message, inner);

/// <summary>Charging a credit card through a clearing company's hosted payment page (today only Invoice4U).</summary>
public interface ICardGateway
{
    /// <summary>The business has an account key; without it the card payment is not offered.</summary>
    bool IsConfigured { get; }

    Task<CardPage> CreatePageAsync(CardPageRequest request, CancellationToken ct);

    /// <summary>
    /// Looks the charge up at the clearing company. The callback alone is never trusted: an order is only marked paid
    /// when the clearing log shows a successful charge of the order's amount.
    /// </summary>
    Task<CardCharge?> FindChargeAsync(string? paymentId, string? traceId, CancellationToken ct);
}

/// <summary>Registered while no Invoice4U key is set: the card payment is simply not available.</summary>
public class UnconfiguredCardGateway : ICardGateway
{
    public bool IsConfigured => false;

    public Task<CardPage> CreatePageAsync(CardPageRequest request, CancellationToken ct) =>
        throw new CardGatewayException("Invoice4U is not configured.");

    public Task<CardCharge?> FindChargeAsync(string? paymentId, string? traceId, CancellationToken ct) =>
        throw new CardGatewayException("Invoice4U is not configured.");
}
