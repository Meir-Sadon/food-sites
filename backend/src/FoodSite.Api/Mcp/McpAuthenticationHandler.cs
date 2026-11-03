using System.Security.Claims;
using System.Text.Encodings.Web;
using FoodSite.Api.Auth;
using FoodSite.Api.Data;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace FoodSite.Api.Mcp;

/// <summary>
/// Signs in a request to <c>/mcp</c> whose <c>Authorization: Bearer</c> token is the access token of a live Claude
/// connection. Only the MCP endpoint asks for this scheme, and it asks for nothing else, so the token never works on
/// the admin, client or ops APIs. A missing or dead token answers 401 with the address of the resource metadata,
/// which is how Claude finds where to sign in.
/// </summary>
public class McpAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    AppDbContext db,
    TimeProvider time) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    private const string BearerPrefix = "Bearer ";

    /// <summary>LastUsedAt is written at most this often, so every tool call is not a database write.</summary>
    private static readonly TimeSpan TouchEvery = TimeSpan.FromMinutes(5);

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        string? header = Request.Headers.Authorization;
        if (header is null || !header.StartsWith(BearerPrefix, StringComparison.OrdinalIgnoreCase))
            return AuthenticateResult.NoResult();

        var token = header[BearerPrefix.Length..].Trim();
        if (!token.StartsWith(McpOAuth.AccessPrefix, StringComparison.Ordinal))
            return AuthenticateResult.Fail("Not a connector token.");

        var hash = McpOAuth.Hash(token);
        var now = time.GetUtcNow();
        var connection = await db.McpConnections.SingleOrDefaultAsync(c => c.AccessTokenHash == hash, Context.RequestAborted);
        if (connection is null || connection.RevokedAt is not null || connection.AccessTokenExpiresAt is not { } expires || expires <= now
            || !AdminActor.IsKnown(connection.Actor))
            return AuthenticateResult.Fail("The connector token is not live.");

        if (connection.LastUsedAt is null || now - connection.LastUsedAt >= TouchEvery)
        {
            connection.LastUsedAt = now;
            await db.SaveChangesAsync(Context.RequestAborted);
        }

        var identity = new ClaimsIdentity(
            [
                new Claim(ClaimTypes.Role, McpOAuth.Role),
                new Claim(AdminTokenService.ActorClaim, connection.Actor),
                new Claim(McpOAuth.ConnectionClaim, connection.Id.ToString(System.Globalization.CultureInfo.InvariantCulture)),
            ],
            McpOAuth.Scheme);
        return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), McpOAuth.Scheme));
    }

    protected override Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        Response.StatusCode = StatusCodes.Status401Unauthorized;
        var metadata = McpOAuth.Origin(Request) + "/.well-known/oauth-protected-resource" + McpOAuth.Path;
        Response.Headers.WWWAuthenticate = $"Bearer resource_metadata=\"{metadata}\"";
        return Task.CompletedTask;
    }
}
