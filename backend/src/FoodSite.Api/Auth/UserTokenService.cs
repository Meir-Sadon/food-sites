using System.Security.Claims;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace FoodSite.Api.Auth;

/// <summary>Session tokens for logged-in clients. The user id is in the "sub" claim.</summary>
public class UserTokenService(IOptions<JwtOptions> jwt, IOptions<AccountOptions> account, TimeProvider time)
{
    /// <summary>Name of the authentication scheme that reads the client's session cookie.</summary>
    public const string Scheme = "User";

    public static string Audience(string issuer) => issuer + "/user";

    /// <summary>Claim set on a session the business owner opened as a client (to place an order for them).</summary>
    public const string OwnerClaim = "owner";

    /// <summary>How long a session opened by the owner as a client lasts.</summary>
    public static readonly TimeSpan OwnerSessionLength = TimeSpan.FromHours(12);

    public (string Token, DateTimeOffset ExpiresAt) CreateToken(int userId, bool byOwner = false)
    {
        var now = time.GetUtcNow();
        var expiresAt = byOwner ? now.Add(OwnerSessionLength) : now.AddDays(account.Value.SessionDays);
        var token = new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = jwt.Value.Issuer,
            Audience = Audience(jwt.Value.Issuer),
            Subject = new ClaimsIdentity(byOwner
                ? [new Claim("sub", userId.ToString()), new Claim(OwnerClaim, "1")]
                : [new Claim("sub", userId.ToString())]),
            IssuedAt = now.UtcDateTime,
            NotBefore = now.UtcDateTime,
            Expires = expiresAt.UtcDateTime,
            SigningCredentials = new SigningCredentials(
                AdminTokenService.SigningKey(jwt.Value.Secret), SecurityAlgorithms.HmacSha256),
        });
        return (token, expiresAt);
    }
}
