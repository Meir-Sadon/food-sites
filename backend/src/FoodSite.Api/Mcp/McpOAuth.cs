using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using FoodSite.Api.Auth;
using Microsoft.Extensions.Options;

namespace FoodSite.Api.Mcp;

/// <summary>
/// The Claude connector's settings (<c>Mcp</c> section). Only these redirect addresses may receive a code, so a
/// site's admin can only connect it to Claude, never to another app that registers itself.
/// </summary>
public class McpOptions
{
    public const string Section = "Mcp";

    /// <summary>
    /// Claude's callback for claude.ai, the desktop and mobile apps, and Claude Code's loopback callback
    /// (any port, <see cref="McpOAuth.RedirectAllowed"/>).
    /// </summary>
    public List<string> RedirectUris { get; set; } =
    [
        "https://claude.ai/api/mcp/auth_callback",
        "https://claude.com/api/mcp/auth_callback",
        "http://localhost/callback",
        "http://127.0.0.1/callback",
    ];

    public int AccessTokenMinutes { get; set; } = 60;
    public int RefreshTokenDays { get; set; } = 60;
    public int CodeMinutes { get; set; } = 5;
}

/// <summary>The OAuth pieces of the Claude connector: tokens, codes, PKCE and redirect checks.</summary>
public static class McpOAuth
{
    /// <summary>The path of the MCP endpoint; the resource the tokens are for is the site's origin plus this.</summary>
    public const string Path = "/mcp";

    public const string Scheme = "Mcp";
    public const string Role = "mcp";

    /// <summary>The connection a request's token belongs to.</summary>
    public const string ConnectionClaim = "mcp_connection";

    public const string AccessPrefix = "fsma_";
    public const string RefreshPrefix = "fsmr_";
    public const string CodePrefix = "fsmc_";

    public static string NewSecret(string prefix) => prefix + Base64Url(RandomNumberGenerator.GetBytes(32));

    public static string Hash(string secret) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(secret)));

    /// <summary>PKCE S256: the challenge is the base64url SHA-256 of the verifier.</summary>
    public static bool VerifierMatches(string? challenge, string? verifier)
    {
        if (string.IsNullOrEmpty(challenge) || string.IsNullOrEmpty(verifier) || verifier.Length is < 43 or > 128)
            return false;
        var computed = Base64Url(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));
        return CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(computed), Encoding.ASCII.GetBytes(challenge));
    }

    /// <summary>
    /// Whether a redirect address is one of the allowed ones. A loopback address (http://localhost or 127.0.0.1)
    /// matches on any port, as native apps pick a free port each time.
    /// </summary>
    public static bool RedirectAllowed(McpOptions options, string? uri)
    {
        if (!Uri.TryCreate(uri, UriKind.Absolute, out var given) || given.Fragment.Length > 0)
            return false;
        foreach (var allowed in options.RedirectUris)
        {
            if (!Uri.TryCreate(allowed, UriKind.Absolute, out var expected))
                continue;
            var loopback = expected.Scheme == Uri.UriSchemeHttp && expected.IsLoopback;
            if (given.Scheme == expected.Scheme
                && string.Equals(given.Host, expected.Host, StringComparison.OrdinalIgnoreCase)
                && (loopback || given.Port == expected.Port)
                && given.AbsolutePath == expected.AbsolutePath
                && given.Query.Length == 0)
                return true;
        }
        return false;
    }

    /// <summary>The site's origin as the request sees it (the proxy's scheme, with forwarded headers on).</summary>
    public static string Origin(HttpRequest request) => $"{request.Scheme}://{request.Host}";

    public static string Resource(HttpRequest request) => Origin(request) + Path;

    public static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    public static byte[]? FromBase64Url(string text)
    {
        var padded = text.Replace('-', '+').Replace('_', '/');
        padded += (padded.Length % 4) switch { 2 => "==", 3 => "=", _ => "" };
        try
        {
            return Convert.FromBase64String(padded);
        }
        catch (FormatException)
        {
            return null;
        }
    }
}

/// <summary>
/// A client registered through dynamic client registration. Nothing is stored: the client id carries the client's
/// name and redirect addresses, signed with the site's secret, so registering cannot fill the database and a client
/// id cannot be forged.
/// </summary>
public record RegisteredClient(string Name, IReadOnlyList<string> RedirectUris);

public class McpClientId(IOptions<JwtOptions> jwt)
{
    public const int MaxLength = 800;
    public const int MaxRedirectUris = 4;

    private const string Purpose = "mcp-client:";

    public string Create(RegisteredClient client)
    {
        var payload = McpOAuth.Base64Url(JsonSerializer.SerializeToUtf8Bytes(new Payload(client.Name, [.. client.RedirectUris])));
        return $"{payload}.{Sign(payload)}";
    }

    public RegisteredClient? Read(string? clientId)
    {
        if (string.IsNullOrEmpty(clientId) || clientId.Length > MaxLength)
            return null;
        var dot = clientId.IndexOf('.');
        if (dot <= 0)
            return null;
        var payload = clientId[..dot];
        if (!CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(clientId[(dot + 1)..]), Encoding.ASCII.GetBytes(Sign(payload))))
            return null;
        var bytes = McpOAuth.FromBase64Url(payload);
        if (bytes is null)
            return null;
        try
        {
            var read = JsonSerializer.Deserialize<Payload>(bytes);
            return read is null ? null : new RegisteredClient(read.N, read.R);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private string Sign(string payload)
    {
        var key = Encoding.UTF8.GetBytes(jwt.Value.Secret);
        return McpOAuth.Base64Url(HMACSHA256.HashData(key, Encoding.UTF8.GetBytes(Purpose + payload)));
    }

    private sealed record Payload(string N, List<string> R);
}
