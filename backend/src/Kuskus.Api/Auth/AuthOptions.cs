namespace Kuskus.Api.Auth;

public class JwtOptions
{
    public const string Section = "Jwt";

    /// <summary>HMAC signing key. At least 32 bytes.</summary>
    public string Secret { get; set; } = "";
    public string Issuer { get; set; } = "kuskus-shel-ima";
}

public class AdminOptions
{
    public const string Section = "Admin";

    /// <summary>
    /// Hash produced by <c>dotnet run -- hash-password</c>. Copied into Settings on startup
    /// when Settings has no admin password yet; ignored afterwards.
    /// </summary>
    public string? PasswordHash { get; set; }

    public int SessionHours { get; set; } = 12;

    public int LoginAttemptsPerMinute { get; set; } = 5;
}

public class CookieOptions
{
    public const string Section = "AuthCookie";

    public string Name { get; set; } = "kuskus_admin";

    /// <summary>Cookie of a logged-in client (the admin session uses <see cref="Name"/>).</summary>
    public string UserName { get; set; } = "kuskus_user";

    /// <summary>Send only over HTTPS. Turn off for plain-HTTP local runs.</summary>
    public bool Secure { get; set; } = true;

    /// <summary>Lax when site and API share a domain; None when they are on different domains.</summary>
    public SameSiteMode SameSite { get; set; } = SameSiteMode.Lax;
}

public class AccountOptions
{
    public const string Section = "Account";

    /// <summary>How long a client stays logged in after confirming the phone.</summary>
    public int SessionDays { get; set; } = 30;
}
