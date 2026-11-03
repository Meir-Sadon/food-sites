namespace FoodSite.Api.Data.Entities;

/// <summary>
/// One Claude account the admin connected to the site (the <c>mcp</c> feature, <see cref="Mcp.McpOAuth"/>).
/// It starts with a one-time code when the admin approves the connection in the admin, which the client trades for
/// an access token and a refresh token. Only SHA-256 hashes of the code and the tokens are kept. Removing the
/// connection (<see cref="RevokedAt"/>) turns its tokens off at once.
/// </summary>
public class McpConnection
{
    public const int ClientNameMaxLength = 100;
    public const int RedirectUriMaxLength = 500;
    public const int HashLength = 64;
    public const int ChallengeMaxLength = 128;

    public int Id { get; set; }

    /// <summary>The name the client registered with (such as "Claude"), shown in the admin's list.</summary>
    public required string ClientName { get; set; }

    /// <summary>The client id it registered with (<see cref="Mcp.McpClientId"/>), checked again when it trades the code.</summary>
    public required string ClientId { get; set; }

    public required string RedirectUri { get; set; }

    /// <summary>The admin (<see cref="Auth.AdminActor"/>) who approved it; Claude acts with that admin's rights.</summary>
    public required string Actor { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? LastUsedAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }

    public string? CodeHash { get; set; }

    /// <summary>The PKCE S256 challenge the client sent with the authorization request.</summary>
    public string? CodeChallenge { get; set; }

    public DateTimeOffset? CodeExpiresAt { get; set; }

    public string? AccessTokenHash { get; set; }
    public DateTimeOffset? AccessTokenExpiresAt { get; set; }
    public string? RefreshTokenHash { get; set; }
    public DateTimeOffset? RefreshTokenExpiresAt { get; set; }
}
