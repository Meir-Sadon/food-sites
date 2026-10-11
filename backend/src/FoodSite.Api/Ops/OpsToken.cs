using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using FoodSite.Api.Data;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace FoodSite.Api.Ops;

/// <summary>
/// The console's key to one site: a random token the master creates in the admin and copies into the console.
/// The site keeps only its SHA-256 hash (<c>Settings.OpsTokenHash</c>), and the console sends it in an
/// <c>Authorization: Bearer</c> header. It is a scheme of its own, so it never works as an admin or client session,
/// and those sessions never work on the ops API.
/// </summary>
public static class OpsToken
{
    public const string Scheme = "Ops";
    public const string Role = "ops";

    /// <summary>Who made a change through the ops API, on audit entries.</summary>
    public const string Actor = "console";

    /// <summary>Marks the token so a stray one is easy to recognise (in a log, a paste, a secret scanner).</summary>
    public const string Prefix = "fso_";

    public static string Create() =>
        Prefix + Base64UrlEncode(RandomNumberGenerator.GetBytes(32));

    public static string Hash(string token) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    public static bool Matches(string? storedHash, string token)
    {
        if (string.IsNullOrEmpty(storedHash) || !token.StartsWith(Prefix, StringComparison.Ordinal))
            return false;
        return CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(storedHash), Encoding.ASCII.GetBytes(Hash(token)));
    }

    private static string Base64UrlEncode(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}

/// <summary>Signs in a request whose <c>Authorization: Bearer</c> token is the site's console token.</summary>
public class OpsAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    AppDbContext db) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    private const string BearerPrefix = "Bearer ";

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        string? header = Request.Headers.Authorization;
        if (header is null || !header.StartsWith(BearerPrefix, StringComparison.OrdinalIgnoreCase))
            return AuthenticateResult.NoResult();

        var token = header[BearerPrefix.Length..].Trim();
        var hash = await db.Settings.AsNoTracking().Select(s => s.OpsTokenHash).SingleOrDefaultAsync(Context.RequestAborted);
        if (!OpsToken.Matches(hash, token))
            return AuthenticateResult.Fail("Not the site's console token.");

        var identity = new ClaimsIdentity([new Claim(ClaimTypes.Role, OpsToken.Role)], OpsToken.Scheme);
        return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), OpsToken.Scheme));
    }
}
