using FoodSite.Api.Auth;
using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Mcp;
using FoodSite.Api.Sites;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace FoodSite.Api.Controllers.Admin;

/// <summary>
/// The admin's side of the Claude connector: the approval page's check and approval (which makes the one-time code
/// Claude trades for tokens), and the list of connected Claude accounts with a way to disconnect each one.
/// </summary>
[Route("api/admin/mcp")]
[RequireFeature(Features.Mcp)]
public class McpConnectionsController(
    AppDbContext db,
    McpClientId clientIds,
    IOptions<McpOptions> options,
    TimeProvider time) : AdminControllerBase
{
    public record ApprovalInfoDto(string ClientName, string RedirectHost);

    public record ApproveRequest(
        string? ClientId,
        string? RedirectUri,
        string? CodeChallenge,
        string? CodeChallengeMethod,
        string? State,
        string? Resource);

    public record ApproveResult(string RedirectUrl);

    public record ConnectionDto(int Id, string ClientName, string Actor, DateTimeOffset CreatedAt, DateTimeOffset? LastUsedAt);

    /// <summary>Who asks to connect, for the approval page; 400 <c>mcpInvalidRequest</c> when the request is not valid.</summary>
    [HttpGet("approval")]
    public ActionResult<ApprovalInfoDto> Approval([FromQuery] string? clientId, [FromQuery] string? redirectUri)
    {
        var client = Check(clientId, redirectUri);
        if (client is null)
            return Invalid("request", "mcpInvalidRequest");
        return new ApprovalInfoDto(client.Name, new Uri(redirectUri!).Host);
    }

    /// <summary>The admin approves: a connection with a one-time code, and the address to send the browser back to.</summary>
    [HttpPost("approve")]
    public async Task<ActionResult<ApproveResult>> Approve(ApproveRequest request)
    {
        var client = Check(request.ClientId, request.RedirectUri);
        if (client is null)
            return Invalid("request", "mcpInvalidRequest");
        if (request.CodeChallengeMethod != "S256" || string.IsNullOrEmpty(request.CodeChallenge)
            || request.CodeChallenge.Length is < 43 or > McpConnection.ChallengeMaxLength)
            return Invalid("codeChallenge", "mcpInvalidRequest");
        if (!string.IsNullOrEmpty(request.Resource) && !SameResource(request.Resource))
            return Invalid("resource", "mcpInvalidRequest");

        var actor = User.FindFirst(AdminTokenService.ActorClaim)?.Value;
        if (!AdminActor.IsKnown(actor))
            return Forbid();

        var now = time.GetUtcNow();
        var code = McpOAuth.NewSecret(McpOAuth.CodePrefix);
        db.McpConnections.Add(new McpConnection
        {
            ClientName = client.Name,
            ClientId = request.ClientId!,
            RedirectUri = request.RedirectUri!,
            Actor = actor!,
            CreatedAt = now,
            CodeHash = McpOAuth.Hash(code),
            CodeChallenge = request.CodeChallenge,
            CodeExpiresAt = now.AddMinutes(options.Value.CodeMinutes),
        });
        await db.SaveChangesAsync();

        var query = new Dictionary<string, string?>
        {
            ["code"] = code,
            ["iss"] = McpOAuth.Origin(Request),
        };
        if (!string.IsNullOrEmpty(request.State))
            query["state"] = request.State;
        return new ApproveResult(Microsoft.AspNetCore.WebUtilities.QueryHelpers.AddQueryString(request.RedirectUri!, query));
    }

    /// <summary>The live connections: approved and not removed (a code never traded expires on its own).</summary>
    [HttpGet("connections")]
    public async Task<List<ConnectionDto>> Connections()
    {
        var now = time.GetUtcNow();
        return await db.McpConnections.AsNoTracking()
            .Where(c => c.RevokedAt == null && (c.RefreshTokenExpiresAt > now || c.CodeExpiresAt > now))
            .OrderByDescending(c => c.CreatedAt)
            .Select(c => new ConnectionDto(c.Id, c.ClientName, c.Actor, c.CreatedAt, c.LastUsedAt))
            .ToListAsync();
    }

    /// <summary>Disconnects one Claude account: its tokens stop working at once.</summary>
    [HttpDelete("connections/{id:int}")]
    public async Task<IActionResult> Revoke(int id)
    {
        var connection = await db.McpConnections.SingleOrDefaultAsync(c => c.Id == id && c.RevokedAt == null);
        if (connection is null)
            return NotFound();
        connection.RevokedAt = time.GetUtcNow();
        connection.CodeHash = null;
        connection.AccessTokenHash = null;
        connection.RefreshTokenHash = null;
        await db.SaveChangesAsync();
        return NoContent();
    }

    private RegisteredClient? Check(string? clientId, string? redirectUri)
    {
        var client = clientIds.Read(clientId);
        return client is not null && redirectUri is not null && client.RedirectUris.Contains(redirectUri)
            && McpOAuth.RedirectAllowed(options.Value, redirectUri)
            ? client
            : null;
    }

    private bool SameResource(string resource)
    {
        var expected = McpOAuth.Resource(Request);
        var origin = McpOAuth.Origin(Request);
        var given = resource.TrimEnd('/');
        return string.Equals(given, expected, StringComparison.OrdinalIgnoreCase)
            || string.Equals(given, origin, StringComparison.OrdinalIgnoreCase);
    }
}
