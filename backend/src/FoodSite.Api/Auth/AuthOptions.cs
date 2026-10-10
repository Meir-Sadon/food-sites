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
    /// The site owner's first password: a hash produced by <c>dotnet run -- hash-password</c>. Copied into Settings
    /// on startup when Settings has no owner password yet; ignored afterwards (the owner changes it from the admin).
    /// </summary>
    public string? PasswordHash { get; set; }

    /// <summary>The site owner's user name on the admin login page.</summary>
    public string OwnerUsername { get; set; } = "admin";

    /// <summary>
    /// The platform's own admin, the same on every site. Its password lives only in configuration (a hash from
    /// <c>hash-password</c> in <see cref="MasterPasswordHash"/>), so nothing done on the site can change or lock it out.
    /// </summary>
    public string MasterUsername { get; set; } = "master";

    /// <summary>Empty turns the master login off.</summary>
    public string? MasterPasswordHash { get; set; }

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
