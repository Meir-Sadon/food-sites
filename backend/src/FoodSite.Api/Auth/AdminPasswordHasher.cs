using Microsoft.AspNetCore.Identity;

namespace FoodSite.Api.Auth;

/// <summary>Hashes and checks the single admin password with ASP.NET Core's PBKDF2 hasher.</summary>
public static class AdminPasswordHasher
{
    private sealed class Admin;

    private static readonly PasswordHasher<Admin> Hasher = new();
    private static readonly Admin AdminUser = new();

    public static string Hash(string password) => Hasher.HashPassword(AdminUser, password);

    public static bool Verify(string? hash, string password)
    {
        if (string.IsNullOrEmpty(hash) || string.IsNullOrEmpty(password))
            return false;

        try
        {
            return Hasher.VerifyHashedPassword(AdminUser, hash, password) != PasswordVerificationResult.Failed;
        }
        catch (FormatException)
        {
            return false;
        }
    }
}
