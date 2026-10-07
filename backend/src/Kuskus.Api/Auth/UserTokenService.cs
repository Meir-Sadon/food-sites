using System.Security.Claims;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Kuskus.Api.Auth;

/// <summary>Session tokens for logged-in clients. The user id is in the "sub" claim.</summary>
public class UserTokenService(IOptions<JwtOptions> jwt, IOptions<AccountOptions> account, TimeProvider time)
{
    /// <summary>Name of the authentication scheme that reads the client's session cookie.</summary>
    public const string Scheme = "User";

    public static string Audience(string issuer) => issuer + "/user";

    public (string Token, DateTimeOffset ExpiresAt) CreateToken(int userId)
    {
        var now = time.GetUtcNow();
        var expiresAt = now.AddDays(account.Value.SessionDays);
        var token = new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = jwt.Value.Issuer,
            Audience = Audience(jwt.Value.Issuer),
            Subject = new ClaimsIdentity([new Claim("sub", userId.ToString())]),
            IssuedAt = now.UtcDateTime,
            NotBefore = now.UtcDateTime,
            Expires = expiresAt.UtcDateTime,
            SigningCredentials = new SigningCredentials(
                AdminTokenService.SigningKey(jwt.Value.Secret), SecurityAlgorithms.HmacSha256),
        });
        return (token, expiresAt);
    }
}
