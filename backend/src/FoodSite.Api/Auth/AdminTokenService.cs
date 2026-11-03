using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace FoodSite.Api.Auth;

public class AdminTokenService(IOptions<JwtOptions> jwt, IOptions<AdminOptions> admin, TimeProvider time)
{
    public const string AdminRole = "admin";

    /// <summary>Which admin (<see cref="AdminActor"/>) the session belongs to.</summary>
    public const string ActorClaim = "actor";

    /// <summary>
    /// Set on the short-lived token the Claude connector calls the admin API with (<see cref="Mcp.AdminApiCaller"/>),
    /// so the audit trail records the change as made through Claude.
    /// </summary>
    public const string ViaClaim = "via";

    public const string ViaClaude = "claude";

    public static SymmetricSecurityKey SigningKey(string secret) => new(Encoding.UTF8.GetBytes(secret));

    public (string Token, DateTimeOffset ExpiresAt) CreateToken(string actor) =>
        CreateToken(actor, TimeSpan.FromHours(admin.Value.SessionHours), null);

    public (string Token, DateTimeOffset ExpiresAt) CreateToken(string actor, TimeSpan lifetime, string? via)
    {
        var now = time.GetUtcNow();
        var expiresAt = now + lifetime;
        List<Claim> claims = [new Claim(ClaimTypes.Role, AdminRole), new Claim(ActorClaim, actor)];
        if (via is not null)
            claims.Add(new Claim(ViaClaim, via));
        var token = new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = jwt.Value.Issuer,
            Audience = jwt.Value.Issuer,
            Subject = new ClaimsIdentity(claims),
            IssuedAt = now.UtcDateTime,
            NotBefore = now.UtcDateTime,
            Expires = expiresAt.UtcDateTime,
            SigningCredentials = new SigningCredentials(SigningKey(jwt.Value.Secret), SecurityAlgorithms.HmacSha256),
        });
        return (token, expiresAt);
    }
}
