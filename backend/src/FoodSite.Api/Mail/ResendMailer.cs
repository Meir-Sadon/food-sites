using System.Net.Http.Headers;
using System.Net.Http.Json;
using FoodSite.Api.Sites;
using Microsoft.Extensions.Options;

namespace FoodSite.Api.Mail;

public class MailOptions
{
    public const string Section = "Mail";

    /// <summary>A Resend API key. While it is empty no mail is sent (<see cref="NoopMailer"/>).</summary>
    public string? ResendApiKey { get; set; }

    /// <summary>
    /// The sender address. Resend lets an account without a verified domain send only from its test address
    /// (and only to the account's own mail address); with a verified domain use e.g. "orders@example.com".
    /// </summary>
    public string From { get; set; } = "onboarding@resend.dev";

    /// <summary>
    /// A Brevo API key (brevo.com, free: 300 mails a day). When set, Brevo is used instead of Resend, and
    /// <see cref="From"/> must be a sender address verified in Brevo (no domain needed).
    /// </summary>
    public string? BrevoApiKey { get; set; }

    public string BrevoBaseUrl { get; set; } = "https://api.brevo.com";

    public string BaseUrl { get; set; } = "https://api.resend.com";

    /// <summary>Edits are held this long after the last one, so a burst of changes goes out as one mail.</summary>
    public int ChangeQuietSeconds { get; set; } = 120;

    /// <summary>A mail goes out at the latest this long after the first edit it holds, however busy the admin is.</summary>
    public int ChangeMaxWaitSeconds { get; set; } = 900;

    /// <summary>How often held edits are checked.</summary>
    public int PollSeconds { get; set; } = 15;

    public bool UsesBrevo => !string.IsNullOrWhiteSpace(BrevoApiKey);

    public bool IsConfigured => UsesBrevo || !string.IsNullOrWhiteSpace(ResendApiKey);
}

/// <summary>Sends mail through Resend's HTTP API (SMTP ports are often blocked on free hosting).</summary>
public class ResendMailer(HttpClient http, IOptions<MailOptions> options, IOptions<SiteOptions> site) : IMailer
{
    private readonly MailOptions _options = options.Value;

    public async Task SendAsync(string to, string subject, string html, string text, CancellationToken ct = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{_options.BaseUrl.TrimEnd('/')}/emails")
        {
            Content = JsonContent.Create(new
            {
                from = string.IsNullOrWhiteSpace(site.Value.Name) ? _options.From : $"{site.Value.Name.Replace("\"", "")} <{_options.From}>",
                to = new[] { to },
                subject,
                html,
                text,
            }),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.ResendApiKey);

        using var response = await http.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException(
                $"Resend answered {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync(ct)}");
    }
}
