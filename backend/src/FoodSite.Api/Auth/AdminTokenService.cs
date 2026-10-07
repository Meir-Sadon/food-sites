using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace FoodSite.Api.Auth;

public class AdminTokenService(IOptions<JwtOptions> jwt, IOptions<AdminOptions> admin, TimeProvider time)
{
    public const string AdminRole = "admin";

    public static SymmetricSecurityKey SigningKey(string secret) => new(Encoding.UTF8.GetBytes(secret));

    public (string Token, DateTimeOffset ExpiresAt) CreateToken()
    {
        var now = time.GetUtcNow();
        var expiresAt = now.AddHours(admin.Value.SessionHours);
        var token = new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = jwt.Value.Issuer,
            Audience = jwt.Value.Issuer,
            Subject = new ClaimsIdentity([new Claim(ClaimTypes.Role, AdminRole)]),
            IssuedAt = now.UtcDateTime,
            NotBefore = now.UtcDateTime,
            Expires = expiresAt.UtcDateTime,
            SigningCredentials = new SigningCredentials(SigningKey(jwt.Value.Secret), SecurityAlgorithms.HmacSha256),
        });
        return (token, expiresAt);
    }
}
