using System.Globalization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using FoodSite.Api.Data.Entities;
using Microsoft.Extensions.Options;

namespace FoodSite.Api.Messaging;

public class SmsOptions
{
    public const string Section = "Sms";

    /// <summary>The account's user name at the SMS provider (TextMe). With <see cref="Token"/> and <see cref="Source"/> it turns real sending on.</summary>
    public string? Username { get; set; }
    public string? Token { get; set; }

    /// <summary>The sender the client sees: at most 11 digits or English letters, verified at the provider.</summary>
    public string? Source { get; set; }

    public string BaseUrl { get; set; } = "https://my.textme.co.il/api";

    /// <summary>
    /// This site's confirmation text. Placeholders: {siteName} {name} {orderId} {date} {time} {method} {total}.
    /// Empty uses <see cref="SmsMessages.DefaultConfirmation"/>.
    /// </summary>
    public string? ConfirmationTemplate { get; set; }

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(Username) && !string.IsNullOrWhiteSpace(Token) && !string.IsNullOrWhiteSpace(Source);
}

/// <summary>Sends through TextMe's HTTP API (https://docs.textme.co.il/endpoints/send).</summary>
public class TextMeSmsSender(HttpClient http, IOptions<SmsOptions> options) : ISmsSender
{
    private readonly SmsOptions _options = options.Value;

    public async Task SendAsync(string phone, string message, CancellationToken ct = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, _options.BaseUrl)
        {
            Content = JsonContent.Create(Payload(phone, message)),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.Token);

        using var response = await http.SendAsync(request, ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException($"SMS API answered {(int)response.StatusCode}: {body}");

        // Errors also come back with HTTP 200; only status 0 means the provider accepted the message.
        var status = JsonNode.Parse(body)?["status"]?.GetValue<int>();
        if (status != 0)
            throw new HttpRequestException($"SMS API refused the message: {body}");
    }

    public object Payload(string phone, string message) => new
    {
        sms = new
        {
            user = new { username = _options.Username },
            source = _options.Source,
            destinations = new { phone = new[] { new Dictionary<string, string> { ["_"] = phone } } },
            message,
        },
    };
}

public static class SmsMessages
{
    public const string DefaultConfirmation = "{siteName}: תודה {name}, הזמנה #{orderId} התקבלה ל-{date}. סה״כ ₪{total}";

    public static string Confirmation(Order order, string? siteName, string? template)
    {
        var values = new Dictionary<string, string>
        {
            ["siteName"] = siteName?.Trim() ?? "",
            ["name"] = order.Name.Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? "",
            ["orderId"] = order.Id.ToString(CultureInfo.InvariantCulture),
            ["date"] = order.SupplyDate.ToString("dd/MM", CultureInfo.InvariantCulture),
            ["time"] = order.DeliveryHour?.ToString("HH:mm", CultureInfo.InvariantCulture) ?? "",
            ["method"] = order.FulfillmentMethod == FulfillmentMethod.Delivery ? "משלוח" : "איסוף עצמי",
            ["total"] = order.Total.ToString("0.##", CultureInfo.InvariantCulture),
        };
        var text = string.IsNullOrWhiteSpace(template) ? DefaultConfirmation : template;
        foreach (var (key, value) in values)
            text = text.Replace("{" + key + "}", value);
        return text.Trim();
    }
}
