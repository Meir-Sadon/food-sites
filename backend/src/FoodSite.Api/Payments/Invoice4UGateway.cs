using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;

namespace FoodSite.Api.Payments;

/// <summary>
/// Invoice4U's clearing API (WCF service exposed as JSON): <c>ProcessApiRequestV2</c> opens a hosted payment page,
/// <c>GetClearingLogByParams</c> confirms what was charged. See https://invoice4u.gitbook.io/invoice4u-docs.
/// </summary>
public class Invoice4UGateway(HttpClient http, IOptions<Invoice4UOptions> options, TimeProvider time) : ICardGateway
{
    private readonly Invoice4UOptions _options = options.Value;

    public bool IsConfigured => _options.IsConfigured;

    public async Task<CardPage> CreatePageAsync(CardPageRequest r, CancellationToken ct)
    {
        var body = new JsonObject
        {
            ["request"] = new JsonObject
            {
                ["Invoice4UUserApiKey"] = _options.ApiKey,
                ["Sum"] = r.Amount,
                ["Currency"] = "NIS",
                ["Type"] = 1,
                ["FullName"] = r.Name,
                ["Phone"] = r.Phone,
                ["Description"] = r.Description,
                ["OrderIdClientUsage"] = r.OrderId.ToString(CultureInfo.InvariantCulture),
                ["IsAutoCreateCustomer"] = true,
                ["IsDocCreate"] = true,
                ["DocHeadline"] = r.Description,
                ["DocLanguage"] = "he",
                ["Language"] = "he",
                ["ReturnUrl"] = r.ReturnUrl,
                ["CallBackUrl"] = r.CallBackUrl,
                ["IsQaMode"] = _options.QaMode,
            },
        };
        var d = await PostAsync("ProcessApiRequestV2", body, ct);
        ThrowOnErrors(d);
        var url = d?["ClearingRedirectUrl"]?.GetValue<string>();
        // On a rejection by the clearing company its message lands here instead of an address.
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps)
            throw new CardGatewayException($"Invoice4U returned no payment page: {url}");
        return new CardPage(uri.AbsoluteUri, OpenInfo(d, "ClearingTraceId"));
    }

    public async Task<CardCharge?> FindChargeAsync(string? paymentId, string? traceId, CancellationToken ct)
    {
        var search = new JsonObject
        {
            ["IsSuccess"] = true,
            ["IsCredit"] = false,
        };
        if (!string.IsNullOrWhiteSpace(paymentId))
            search["PaymentId"] = paymentId;
        else
            search["FromDate"] = WcfDate(time.GetUtcNow().AddDays(-3));

        var d = await PostAsync("GetClearingLogByParams", new JsonObject { ["searchParams"] = search, ["token"] = _options.ApiKey }, ct);
        if (d is not JsonArray logs)
            return null;
        foreach (var log in logs.OfType<JsonObject>())
        {
            // The log holds a request row and a response row for a charge; only a successful, non-credit one counts.
            if (log["IsSuccess"]?.GetValue<bool>() != true || log["IsCredit"]?.GetValue<bool>() == true)
                continue;
            if (string.IsNullOrWhiteSpace(paymentId) && (string.IsNullOrWhiteSpace(traceId) || log["ClearingTraceId"]?.ToString() != traceId))
                continue;
            return new CardCharge(
                log["PaymentId"]?.ToString(),
                log["Amount"]?.GetValue<decimal>() ?? 0m,
                log["ClearingConfirmationNumber"]?.ToString(),
                log["PaymentNumber"]?.GetValue<int>() ?? 1);
        }
        return null;
    }

    private async Task<JsonNode?> PostAsync(string method, JsonObject body, CancellationToken ct)
    {
        try
        {
            using var response = await http.PostAsJsonAsync($"{_options.EffectiveBaseUrl}/{method}", body, ct);
            response.EnsureSuccessStatusCode();
            var json = await response.Content.ReadFromJsonAsync<JsonObject>(ct);
            return json?["d"];
        }
        catch (Exception ex) when (ex is HttpRequestException or JsonException or InvalidOperationException or TaskCanceledException)
        {
            throw new CardGatewayException($"Invoice4U {method} failed.", ex);
        }
    }

    private static void ThrowOnErrors(JsonNode? d)
    {
        if (d?["Errors"] is JsonArray { Count: > 0 } errors)
            throw new CardGatewayException("Invoice4U rejected the request: " + string.Join(", ", errors.Select(e => $"{e?["Error"]} ({e?["ID"]})")));
    }

    private static string? OpenInfo(JsonNode? d, string key) =>
        (d?["OpenInfo"] as JsonArray)?.OfType<JsonObject>().FirstOrDefault(i => i["Key"]?.ToString() == key)?["Value"]?.ToString();

    /// <summary>The WCF date format the service wants (ISO 8601 is rejected).</summary>
    private static string WcfDate(DateTimeOffset value) => $"/Date({value.ToUnixTimeMilliseconds()}+0000)/";
}
