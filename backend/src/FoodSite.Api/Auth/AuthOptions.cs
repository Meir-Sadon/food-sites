using FoodSite.Api.Sites;

namespace FoodSite.Api.Auth;

public class JwtOptions
{
    public const string Section = "Jwt";

    /// <summary>HMAC signing key. At least 32 bytes.</summary>
    public string Secret { get; set; } = "";
    /// <summary>Defaults to the site id.</summary>
    public string Issuer { get; set; } = "";

    public void UseSiteDefaults(SiteOptions site)
    {
        if (string.IsNullOrWhiteSpace(Issuer))
            Issuer = site.Id;
    }
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

    /// <summary>The admin session's cookie. Defaults to <c>&lt;siteId&gt;_admin</c>.</summary>
    public string Name { get; set; } = "";

    /// <summary>Cookie of a logged-in client (the admin session uses <see cref="Name"/>). Defaults to <c>&lt;siteId&gt;_user</c>.</summary>
    public string UserName { get; set; } = "";

    /// <summary>Send only over HTTPS. Turn off for plain-HTTP local runs.</summary>
    public bool Secure { get; set; } = true;

    /// <summary>Lax when site and API share a domain; None when they are on different domains.</summary>
    public SameSiteMode SameSite { get; set; } = SameSiteMode.Lax;

    public void UseSiteDefaults(SiteOptions site)
    {
        if (string.IsNullOrWhiteSpace(Name))
            Name = $"{site.Id}_admin";
        if (string.IsNullOrWhiteSpace(UserName))
            UserName = $"{site.Id}_user";
    }
}

public class AccountOptions
{
    public const string Section = "Account";

    /// <summary>How long a client stays logged in after confirming the phone.</summary>
    public int SessionDays { get; set; } = 30;
}
