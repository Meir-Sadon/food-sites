using FoodSite.Api.Auth;

namespace FoodSite.Api.Tests;

/// <summary>Reads a test "credential" of the form <c>sub|email|verified|name</c> instead of calling Google.</summary>
public class FakeGoogleVerifier : IGoogleTokenVerifier
{
    public static string Credential(string sub, string? email, bool verified = true, string? name = null) =>
        $"{sub}|{email}|{verified}|{name}";

    public Task<GoogleIdentity?> VerifyAsync(string credential, CancellationToken ct)
    {
        var parts = credential.Split('|');
        if (parts.Length != 4)
            return Task.FromResult<GoogleIdentity?>(null);
        return Task.FromResult<GoogleIdentity?>(new GoogleIdentity(
            parts[0], parts[1] == "" ? null : parts[1], bool.Parse(parts[2]), parts[3] == "" ? null : parts[3]));
    }
}
