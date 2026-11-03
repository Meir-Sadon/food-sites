using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using FoodSite.Api.Auth;
using FoodSite.Api.Http;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.Options;

namespace FoodSite.Api.Mcp;

/// <summary>How the connector reaches the site's own admin API. The app calls itself over loopback; tests swap in the test server.</summary>
public interface IAdminApiTransport
{
    HttpClient CreateClient();
}

/// <summary>Calls this process's own HTTP address on 127.0.0.1 (the port Kestrel listens on).</summary>
public sealed class LoopbackAdminApiTransport(IServer server) : IAdminApiTransport, IDisposable
{
    private readonly Lazy<HttpClient> _client = new(() => new HttpClient { BaseAddress = Loopback(server), Timeout = TimeSpan.FromSeconds(60) });

    public HttpClient CreateClient() => _client.Value;

    private static Uri Loopback(IServer server)
    {
        var addresses = server.Features.Get<IServerAddressesFeature>()?.Addresses ?? [];
        var http = addresses.FirstOrDefault(a => a.StartsWith("http://", StringComparison.OrdinalIgnoreCase)) ?? addresses.FirstOrDefault()
            ?? throw new InvalidOperationException("The server listens on no address.");
        // Kestrel reports wildcards such as http://[::]:8080 or http://+:8080; only the scheme and the port matter.
        var colon = http.LastIndexOf(':');
        var port = int.Parse(http[(colon + 1)..].TrimEnd('/'), CultureInfo.InvariantCulture);
        var scheme = http.StartsWith("https", StringComparison.OrdinalIgnoreCase) ? "https" : "http";
        return new Uri($"{scheme}://127.0.0.1:{port}/");
    }

    public void Dispose()
    {
        if (_client.IsValueCreated)
            _client.Value.Dispose();
    }
}

/// <summary>The status and body the admin API answered with.</summary>
public record AdminApiResponse(int Status, string Body);

/// <summary>
/// Makes one admin API call for the connector, as the admin who connected it: a session token made for this call
/// alone (two minutes, marked <see cref="AdminTokenService.ViaClaude"/> so the audit trail shows the change came
/// from Claude), sent as the admin cookie with the site's request header. The endpoint does its own validation, so
/// Claude can change nothing the admin could not change by hand.
/// </summary>
public class AdminApiCaller(IAdminApiTransport transport, AdminTokenService tokens, IOptions<Auth.CookieOptions> cookies)
{
    private static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(2);

    public async Task<AdminApiResponse> SendAsync(string actor, string method, string path, string? json, CancellationToken ct)
    {
        if (!AdminActor.IsKnown(actor))
            throw new InvalidOperationException("Unknown admin.");
        var (token, _) = tokens.CreateToken(actor, Lifetime, AdminTokenService.ViaClaude);
        using var request = new HttpRequestMessage(new HttpMethod(method), path);
        request.Headers.Add("Cookie", $"{cookies.Value.Name}={token}");
        request.Headers.Add(RequireRequestHeaderMiddleware.HeaderName, "1");
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        if (json is not null)
            request.Content = new StringContent(json, Encoding.UTF8, "application/json");
        using var response = await transport.CreateClient().SendAsync(request, ct);
        return new AdminApiResponse((int)response.StatusCode, await response.Content.ReadAsStringAsync(ct));
    }
}
