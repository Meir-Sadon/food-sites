using FoodSite.Api.Auth;
using FoodSite.Api.Controllers.Admin;
using FoodSite.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace FoodSite.Api.Controllers;

[ApiController]
[Route("api/admin")]
public class AdminAuthController(
    AppDbContext db,
    AdminTokenService tokens,
    IOptions<Auth.CookieOptions> cookie) : ControllerBase
{
    public const string LoginRateLimitPolicy = "admin-login";

    public const int MinPasswordLength = 8;
    public const int MaxPasswordLength = 200;

    public record LoginRequest(string Password);

    public record ChangePasswordRequest(string? CurrentPassword, string? NewPassword);

    [HttpPost("login")]
    [EnableRateLimiting(LoginRateLimitPolicy)]
    public async Task<IActionResult> Login(LoginRequest request)
    {
        var hash = await db.Settings.Select(s => s.AdminPasswordHash).SingleAsync();
        if (!AdminPasswordHasher.Verify(hash, request.Password))
            return Unauthorized();

        var (token, expiresAt) = tokens.CreateToken();
        Response.Cookies.Append(cookie.Value.Name, token, CookieFor(expiresAt));
        return NoContent();
    }

    [HttpPost("logout")]
    public IActionResult Logout()
    {
        Response.Cookies.Delete(cookie.Value.Name, CookieFor(null));
        return NoContent();
    }

    [HttpGet("me")]
    [Authorize(Roles = AdminTokenService.AdminRole)]
    public IActionResult Me() => Ok(new { role = AdminTokenService.AdminRole });

    /// <summary>
    /// Replaces the admin password. Asks for the current one so a session left open
    /// cannot lock the owner out; rate-limited like login since it checks a password.
    /// </summary>
    [HttpPut("password")]
    [Authorize(Roles = AdminTokenService.AdminRole)]
    [EnableRateLimiting(LoginRateLimitPolicy)]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request)
    {
        var errors = new Errors();
        if (string.IsNullOrEmpty(request.CurrentPassword))
            errors.Add("currentPassword", "required");
        if (string.IsNullOrEmpty(request.NewPassword))
            errors.Add("newPassword", "required");
        else if (request.NewPassword.Length < MinPasswordLength)
            errors.Add("newPassword", "passwordTooShort");
        else if (request.NewPassword.Length > MaxPasswordLength)
            errors.Add("newPassword", "tooLong");
        if (errors.Any)
            return ValidationProblem(new ValidationProblemDetails(errors.ToDictionary()));

        var settings = await db.Settings.SingleAsync();
        if (!AdminPasswordHasher.Verify(settings.AdminPasswordHash, request.CurrentPassword!))
            return ValidationProblem(new ValidationProblemDetails(
                new Errors().Add("currentPassword", "wrongPassword").ToDictionary()));

        settings.AdminPasswordHash = AdminPasswordHasher.Hash(request.NewPassword!);
        await db.SaveChangesAsync();
        return NoContent();
    }

    private Microsoft.AspNetCore.Http.CookieOptions CookieFor(DateTimeOffset? expires) => new()
    {
        HttpOnly = true,
        Secure = cookie.Value.Secure,
        SameSite = cookie.Value.SameSite,
        Path = "/api",
        Expires = expires,
    };
}
