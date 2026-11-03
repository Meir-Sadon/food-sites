using System.Text.Json.Serialization;
using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Mcp;
using FoodSite.Api.Sites;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace FoodSite.Api.Controllers;

/// <summary>
/// The OAuth side of the Claude connector (the <c>mcp</c> feature): the metadata Claude reads to find where to sign
/// in, dynamic client registration, the authorization address (which opens the admin's approval page) and the token
/// endpoint. The admin approves in the admin (<c>McpConnectionsController</c>), so signing in is the admin's own
/// login. These paths sit outside <c>/api</c>, as Claude calls them without the site's request header.
/// </summary>
[RequireFeature(Features.Mcp)]
public class McpOAuthController(
    AppDbContext db,
    McpClientId clientIds,
    IOptions<McpOptions> options,
    IOptions<SiteOptions> site,
    TimeProvider time) : ControllerBase
{
    public const string RateLimitPolicy = "mcp-oauth";

    /// <summary>The admin page that asks the admin to approve the connection.</summary>
    public const string ApprovalPage = "/admin/claude-connect";

    [HttpGet("/.well-known/oauth-protected-resource")]
    [HttpGet("/.well-known/oauth-protected-resource/mcp")]
    public IActionResult ResourceMetadata()
    {
        NoStore();
        return Ok(new
        {
            resource = McpOAuth.Resource(Request),
            authorization_servers = new[] { McpOAuth.Origin(Request) },
            bearer_methods_supported = new[] { "header" },
            resource_name = site.Value.Name ?? site.Value.Id,
        });
    }

    [HttpGet("/.well-known/oauth-authorization-server")]
    public IActionResult ServerMetadata()
    {
        var origin = McpOAuth.Origin(Request);
        NoStore();
        return Ok(new
        {
            issuer = origin,
            authorization_endpoint = origin + "/oauth/authorize",
            token_endpoint = origin + "/oauth/token",
            registration_endpoint = origin + "/oauth/register",
            response_types_supported = new[] { "code" },
            grant_types_supported = new[] { "authorization_code", "refresh_token" },
            code_challenge_methods_supported = new[] { "S256" },
            token_endpoint_auth_methods_supported = new[] { "none" },
        });
    }

    public record RegistrationRequest(
        [property: JsonPropertyName("client_name")] string? ClientName,
        [property: JsonPropertyName("redirect_uris")] List<string>? RedirectUris);

    /// <summary>Dynamic client registration (RFC 7591). Only the allowed redirect addresses are accepted.</summary>
    [HttpPost("/oauth/register")]
    [EnableRateLimiting(RateLimitPolicy)]
    public IActionResult Register([FromBody] RegistrationRequest? request)
    {
        var uris = request?.RedirectUris?.Distinct().ToList() ?? [];
        if (uris.Count is 0 or > McpClientId.MaxRedirectUris || uris.Any(u => u.Length > McpConnection.RedirectUriMaxLength))
            return OAuthError("invalid_redirect_uri", "redirect_uris must list 1 to 4 addresses.");
        if (!uris.All(u => McpOAuth.RedirectAllowed(options.Value, u)))
            return OAuthError("invalid_redirect_uri", "This site accepts only Claude's redirect addresses.");

        var name = string.IsNullOrWhiteSpace(request!.ClientName) ? "Claude" : request.ClientName.Trim();
        if (name.Length > McpConnection.ClientNameMaxLength)
            name = name[..McpConnection.ClientNameMaxLength];
        var clientId = clientIds.Create(new RegisteredClient(name, uris));
        NoStore();
        return StatusCode(StatusCodes.Status201Created, new
        {
            client_id = clientId,
            client_id_issued_at = time.GetUtcNow().ToUnixTimeSeconds(),
            client_name = name,
            redirect_uris = uris,
            grant_types = new[] { "authorization_code", "refresh_token" },
            response_types = new[] { "code" },
            token_endpoint_auth_method = "none",
        });
    }

    /// <summary>
    /// Checks the request and sends the browser to the admin's approval page with the same query. A bad client or
    /// redirect address is answered here and never redirected, as the address may not be the client's.
    /// </summary>
    [HttpGet("/oauth/authorize")]
    public IActionResult Authorize(
        [FromQuery(Name = "client_id")] string? clientId,
        [FromQuery(Name = "redirect_uri")] string? redirectUri)
    {
        var client = clientIds.Read(clientId);
        if (client is null)
            return BadRequest("Unknown client. Remove the connector in Claude and add it again.");
        if (!ValidRedirect(client, redirectUri))
            return BadRequest("This redirect address is not registered for the client.");
        return Redirect(ApprovalPage + Request.QueryString.Value);
    }

    /// <summary>The token endpoint: trades a code (with its PKCE verifier) or a refresh token for new tokens.</summary>
    [HttpPost("/oauth/token")]
    [EnableRateLimiting(RateLimitPolicy)]
    public async Task<IActionResult> Token()
    {
        if (!Request.HasFormContentType)
            return OAuthError("invalid_request", "Send the request as application/x-www-form-urlencoded.");
        var form = await Request.ReadFormAsync();
        var now = time.GetUtcNow();

        switch (form["grant_type"].ToString())
        {
            case "authorization_code":
            {
                var code = form["code"].ToString();
                if (string.IsNullOrEmpty(code))
                    return OAuthError("invalid_request", "code is required.");
                var hash = McpOAuth.Hash(code);
                var connection = await db.McpConnections.SingleOrDefaultAsync(c => c.CodeHash == hash);
                if (connection is null || connection.RevokedAt is not null || connection.CodeExpiresAt is not { } expires || expires <= now
                    || connection.ClientId != form["client_id"].ToString()
                    || connection.RedirectUri != form["redirect_uri"].ToString()
                    || !McpOAuth.VerifierMatches(connection.CodeChallenge, form["code_verifier"].ToString()))
                    return OAuthError("invalid_grant", "The code is not valid.");
                connection.CodeHash = null;
                connection.CodeChallenge = null;
                connection.CodeExpiresAt = null;
                return await IssueAsync(connection, now);
            }
            case "refresh_token":
            {
                var refresh = form["refresh_token"].ToString();
                if (string.IsNullOrEmpty(refresh))
                    return OAuthError("invalid_request", "refresh_token is required.");
                var hash = McpOAuth.Hash(refresh);
                var connection = await db.McpConnections.SingleOrDefaultAsync(c => c.RefreshTokenHash == hash);
                var clientId = form["client_id"].ToString();
                if (connection is null || connection.RevokedAt is not null
                    || connection.RefreshTokenExpiresAt is not { } expires || expires <= now
                    || (clientId.Length > 0 && clientId != connection.ClientId))
                    return OAuthError("invalid_grant", "The refresh token is not valid.");
                return await IssueAsync(connection, now);
            }
            default:
                return OAuthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
        }
    }

    /// <summary>New access and refresh tokens; the refresh token is rotated each time, so an old one stops working.</summary>
    private async Task<IActionResult> IssueAsync(McpConnection connection, DateTimeOffset now)
    {
        var access = McpOAuth.NewSecret(McpOAuth.AccessPrefix);
        var refresh = McpOAuth.NewSecret(McpOAuth.RefreshPrefix);
        var lifetime = TimeSpan.FromMinutes(options.Value.AccessTokenMinutes);
        connection.AccessTokenHash = McpOAuth.Hash(access);
        connection.AccessTokenExpiresAt = now + lifetime;
        connection.RefreshTokenHash = McpOAuth.Hash(refresh);
        connection.RefreshTokenExpiresAt = now.AddDays(options.Value.RefreshTokenDays);
        connection.LastUsedAt = now;
        await db.SaveChangesAsync();
        NoStore();
        return Ok(new
        {
            access_token = access,
            token_type = "Bearer",
            expires_in = (int)lifetime.TotalSeconds,
            refresh_token = refresh,
        });
    }

    private bool ValidRedirect(RegisteredClient client, string? redirectUri) =>
        redirectUri is not null && client.RedirectUris.Contains(redirectUri) && McpOAuth.RedirectAllowed(options.Value, redirectUri);

    private BadRequestObjectResult OAuthError(string error, string description)
    {
        NoStore();
        return BadRequest(new { error, error_description = description });
    }

    private void NoStore() => Response.Headers.CacheControl = "no-store";
}
