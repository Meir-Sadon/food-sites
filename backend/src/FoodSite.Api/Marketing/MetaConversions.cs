using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Phones;

namespace FoodSite.Api.Marketing;

/// <summary>What the order page tells the server about Meta's browser cookies and the page address.</summary>
public record MarketingInput(string? Fbp = null, string? Fbc = null, string? SourceUrl = null);

/// <summary>One Purchase event for Meta's Conversions API.</summary>
public record MetaPurchase(
    string PixelId, string AccessToken, string EventId, DateTimeOffset Time, decimal Value, string Currency,
    string PhoneHash, string? Fbp, string? Fbc, string? SourceUrl, string? ClientIp, string? UserAgent);

/// <summary>Sends events to Meta from the server, so ad blockers and browser limits do not lose orders.</summary>
public interface IMetaConversionsSender
{
    Task SendPurchaseAsync(MetaPurchase purchase, CancellationToken ct = default);
}

public class MetaConversionsSender(HttpClient http) : IMetaConversionsSender
{
    private const string GraphVersion = "v21.0";

    public async Task SendPurchaseAsync(MetaPurchase p, CancellationToken ct = default)
    {
        var userData = new Dictionary<string, object> { ["ph"] = new[] { p.PhoneHash } };
        if (!string.IsNullOrEmpty(p.Fbp)) userData["fbp"] = p.Fbp;
        if (!string.IsNullOrEmpty(p.Fbc)) userData["fbc"] = p.Fbc;
        if (!string.IsNullOrEmpty(p.ClientIp)) userData["client_ip_address"] = p.ClientIp;
        if (!string.IsNullOrEmpty(p.UserAgent)) userData["client_user_agent"] = p.UserAgent;

        var body = new
        {
            data = new[]
            {
                new Dictionary<string, object?>
                {
                    ["event_name"] = "Purchase",
                    ["event_time"] = p.Time.ToUnixTimeSeconds(),
                    ["event_id"] = p.EventId,
                    ["action_source"] = "website",
                    ["event_source_url"] = p.SourceUrl,
                    ["user_data"] = userData,
                    ["custom_data"] = new { currency = p.Currency, value = p.Value },
                },
            },
            // In the body, not the address, so it never lands in a request log.
            access_token = p.AccessToken,
        };
        using var response = await http.PostAsJsonAsync($"https://graph.facebook.com/{GraphVersion}/{Uri.EscapeDataString(p.PixelId)}/events", body, ct);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException($"Meta answered {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync(ct)}");
    }
}

/// <summary>Reports a sent order to Meta when the site has a pixel id and an access token.</summary>
public class MarketingNotifier(IMetaConversionsSender meta, ILogger<MarketingNotifier> logger)
{
    /// <summary>The id the browser pixel uses for the same order, so Meta counts it once.</summary>
    public static string EventId(int orderId) => $"order-{orderId}";

    /// <summary>Meta wants the phone as digits with the country code, lower-case SHA-256.</summary>
    public static string HashPhone(string normalizedPhone) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(PhoneNumber.ToInternational(normalizedPhone))));

    /// <summary>A failed report never fails the order: it is already saved.</summary>
    public async Task PurchaseAsync(Settings settings, Order order, MarketingInput? input, string? clientIp, string? userAgent, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(settings.MetaPixelId) || string.IsNullOrEmpty(settings.MetaAccessToken))
            return;
        try
        {
            await meta.SendPurchaseAsync(new MetaPurchase(
                settings.MetaPixelId, settings.MetaAccessToken, EventId(order.Id), order.CreatedAt, order.Total, "ILS",
                HashPhone(order.Phone), Limit(input?.Fbp), Limit(input?.Fbc), Limit(input?.SourceUrl), clientIp, Limit(userAgent)), ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // The message can name the token's owner but never the token (it travels in the body).
            logger.LogError(ex, "Reporting order {OrderId} to Meta failed", order.Id);
        }
    }

    private static string? Limit(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Length > 500 ? value[..500] : value;
}
