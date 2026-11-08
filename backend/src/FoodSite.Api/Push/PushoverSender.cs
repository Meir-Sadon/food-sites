using Microsoft.Extensions.Options;

namespace FoodSite.Api.Push;

/// <summary>Sends an emergency-priority (2) message through Pushover's HTTP API; it passes silent mode and repeats until acknowledged.</summary>
public class PushoverSender(HttpClient http, IOptions<PushoverOptions> options) : IPushSender
{
    private readonly PushoverOptions _options = options.Value;

    public async Task SendAsync(string userKey, string? sound, string title, string message, string? url, CancellationToken ct = default)
    {
        var form = new Dictionary<string, string>
        {
            ["token"] = _options.AppToken!,
            ["user"] = userKey,
            ["title"] = title,
            ["message"] = message,
            ["priority"] = "2",
            ["retry"] = _options.RetrySeconds.ToString(),
            ["expire"] = _options.ExpireSeconds.ToString(),
            ["sound"] = PushoverSounds.IsKnown(sound) ? sound! : PushoverSounds.All[0],
        };
        if (!string.IsNullOrWhiteSpace(url))
            form["url"] = url;

        using var response = await http.PostAsync($"{_options.BaseUrl.TrimEnd('/')}/1/messages.json", new FormUrlEncodedContent(form), ct);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException($"Pushover answered {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync(ct)}");
    }
}
