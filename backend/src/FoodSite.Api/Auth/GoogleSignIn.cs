using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace FoodSite.Api.Auth;

/// <summary>
/// "Sign in with Google" for clients. A site turns it on by setting <c>Google__ClientId</c> to its own OAuth web client
/// id (Google Cloud Console); with none set the button is hidden and the endpoints answer 404.
/// There is no secret: the browser gets a signed ID token from Google and the API checks its signature and audience.
/// </summary>
public class GoogleOptions
{
    public const string Section = "Google";

    public string? ClientId { get; set; }

    public bool IsConfigured => !string.IsNullOrWhiteSpace(ClientId);
}

/// <summary>Who Google says the person is. <see cref="Subject"/> is Google's stable account id.</summary>
public record GoogleIdentity(string Subject, string? Email, bool EmailVerified, string? Name);

public interface IGoogleTokenVerifier
{
    /// <summary>The identity in a Google ID token, or null when the token is not valid for this site.</summary>
    Task<GoogleIdentity?> VerifyAsync(string credential, CancellationToken ct);
}

public class GoogleTokenVerifier(HttpClient http, IOptions<GoogleOptions> options, TimeProvider time) : IGoogleTokenVerifier
{
    private const string CertsUrl = "https://www.googleapis.com/oauth2/v3/certs";
    private static readonly string[] Issuers = ["https://accounts.google.com", "accounts.google.com"];
    private static readonly TimeSpan KeysLifetime = TimeSpan.FromHours(1);

    private static readonly SemaphoreSlim KeysLock = new(1, 1);
    private static IList<SecurityKey>? _keys;
    private static DateTimeOffset _keysFetched;

    public async Task<GoogleIdentity?> VerifyAsync(string credential, CancellationToken ct)
    {
        if (!options.Value.IsConfigured || string.IsNullOrWhiteSpace(credential) || credential.Length > 4096)
            return null;

        var result = await new JsonWebTokenHandler().ValidateTokenAsync(credential, new TokenValidationParameters
        {
            ValidIssuers = Issuers,
            ValidAudience = options.Value.ClientId,
            IssuerSigningKeys = await KeysAsync(ct),
            ClockSkew = TimeSpan.FromMinutes(1),
        });
        if (!result.IsValid || result.SecurityToken is not JsonWebToken token)
            return null;

        var subject = Claim(token, "sub");
        if (string.IsNullOrEmpty(subject))
            return null;
        return new GoogleIdentity(
            subject, Claim(token, "email"), token.TryGetPayloadValue<bool>("email_verified", out var verified) && verified,
            Claim(token, "name"));
    }

    private static string? Claim(JsonWebToken token, string name) =>
        token.TryGetPayloadValue<string>(name, out var value) ? value : null;

    private async Task<IList<SecurityKey>> KeysAsync(CancellationToken ct)
    {
        if (_keys is not null && time.GetUtcNow() - _keysFetched < KeysLifetime)
            return _keys;
        await KeysLock.WaitAsync(ct);
        try
        {
            if (_keys is not null && time.GetUtcNow() - _keysFetched < KeysLifetime)
                return _keys;
            _keys = new JsonWebKeySet(await http.GetStringAsync(CertsUrl, ct)).GetSigningKeys();
            _keysFetched = time.GetUtcNow();
            return _keys;
        }
        finally
        {
            KeysLock.Release();
        }
    }
}
