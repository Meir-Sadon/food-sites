using System.Net.Http.Json;
using FoodSite.Api.Sites;
using Microsoft.Extensions.Options;

namespace FoodSite.Api.Mail;

/// <summary>Sends mail through Brevo's HTTP API; the sender (<see cref="MailOptions.From"/>) is verified in Brevo.</summary>
public class BrevoMailer(HttpClient http, IOptions<MailOptions> options, IOptions<SiteOptions> site) : IMailer
{
    private readonly MailOptions _options = options.Value;

    public async Task SendAsync(string to, string subject, string html, string text, CancellationToken ct = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{_options.BrevoBaseUrl.TrimEnd('/')}/v3/smtp/email")
        {
            Content = JsonContent.Create(new
            {
                sender = new { name = site.Value.Name, email = _options.From },
                to = new[] { new { email = to } },
                subject,
                htmlContent = html,
                textContent = text,
            }),
        };
        request.Headers.Add("api-key", _options.BrevoApiKey);

        using var response = await http.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException(
                $"Brevo answered {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync(ct)}");
    }
}
