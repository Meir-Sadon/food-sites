using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using FoodSite.Api.Phones;
using Microsoft.Extensions.Options;

namespace FoodSite.Api.Messaging;

public class WhatsAppOptions
{
    public const string Section = "WhatsApp";

    /// <summary>The sending number's id in Meta's WhatsApp Manager. With <see cref="Token"/> it turns real sending on.</summary>
    public string? PhoneNumberId { get; set; }
    public string? Token { get; set; }
    public string ApiVersion { get; set; } = "v21.0";
    public string BaseUrl { get; set; } = "https://graph.facebook.com";

    public string LanguageCode { get; set; } = "he";

    // Template names as approved by Meta. Each has one body variable, {{1}}, that carries the message text.
    public string OrderConfirmationTemplate { get; set; } = "kuskus_order_confirmation";
    public string NewOrderTemplate { get; set; } = "kuskus_new_order";

    public bool IsConfigured => !string.IsNullOrWhiteSpace(PhoneNumberId) && !string.IsNullOrWhiteSpace(Token);

    public string TemplateName(WhatsAppTemplate template) => template switch
    {
        WhatsAppTemplate.OrderConfirmation => OrderConfirmationTemplate,
        _ => NewOrderTemplate,
    };
}

/// <summary>Sends approved template messages through the WhatsApp Cloud API.</summary>
public partial class WhatsAppCloudSender(HttpClient http, IOptions<WhatsAppOptions> options) : IWhatsAppSender
{
    private readonly WhatsAppOptions _options = options.Value;

    public async Task SendAsync(string phone, WhatsAppTemplate template, string message, CancellationToken ct = default)
    {
        var url = $"{_options.BaseUrl.TrimEnd('/')}/{_options.ApiVersion}/{_options.PhoneNumberId}/messages";
        using var request = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = JsonContent.Create(Payload(phone, template, message)),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.Token);

        using var response = await http.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException(
                $"WhatsApp API answered {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync(ct)}");
    }

    public object Payload(string phone, WhatsAppTemplate template, string message) => new
    {
        messaging_product = "whatsapp",
        to = PhoneNumber.ToInternational(phone),
        type = "template",
        template = new
        {
            name = _options.TemplateName(template),
            language = new { code = _options.LanguageCode },
            components = new[]
            {
                new { type = "body", parameters = new[] { new { type = "text", text = TemplateText(message) } } },
            },
        },
    };

    /// <summary>Template variables cannot hold line breaks, tabs or long runs of spaces, so lines are joined with " | ".</summary>
    public static string TemplateText(string message) =>
        Spaces().Replace(string.Join(" | ", message.Split('\n', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)), " ");

    [GeneratedRegex(@"[\t ]{2,}")]
    private static partial Regex Spaces();
}
