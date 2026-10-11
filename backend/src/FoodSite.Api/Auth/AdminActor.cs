namespace FoodSite.Api.Auth;

/// <summary>The two admins of a site. Stored as text on audit entries and in the session token.</summary>
public static class AdminActor
{
    /// <summary>The platform's admin: one user name and password for every site, set in configuration.</summary>
    public const string Master = "master";

    /// <summary>The business owner: the password lives in the site's database and the owner can change it.</summary>
    public const string Owner = "owner";

    public static bool IsKnown(string? actor) => actor is Master or Owner;
}
