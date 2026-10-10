using FoodSite.Api.Auth;
using FoodSite.Api.Controllers.Admin;
using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
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
    IOptions<AdminOptions> admin,
    IOptions<Auth.CookieOptions> cookie,
    TimeProvider time) : ControllerBase
{
    public const string LoginRateLimitPolicy = "admin-login";

    public const int MinPasswordLength = 8;
    public const int MaxPasswordLength = 200;

    /// <param name="Username">The master's or the site owner's user name (not case sensitive).</param>
    public record LoginRequest(string? Username, string Password);

    public record ChangePasswordRequest(string? CurrentPassword, string? NewPassword);

    public record ResetOwnerPasswordRequest(string? NewPassword);

    /// <param name="Actor">Which admin is logged in: <see cref="AdminActor.Master"/> or <see cref="AdminActor.Owner"/>.</param>
    /// <param name="Username">That admin's user name.</param>
    public record MeDto(string Role, string Actor, string Username);

    [HttpPost("login")]
    [EnableRateLimiting(LoginRateLimitPolicy)]
    public async Task<IActionResult> Login(LoginRequest request)
    {
        var actor = ActorFor(request.Username);
        var valid = actor switch
        {
            // The master's password is only in configuration, so the owner can never change or lock it.
            AdminActor.Master => AdminPasswordHasher.Verify(admin.Value.MasterPasswordHash, request.Password),
            AdminActor.Owner => AdminPasswordHasher.Verify(
                await db.Settings.Select(s => s.AdminPasswordHash).SingleAsync(), request.Password),
            _ => false,
        };
        if (!valid)
            return Unauthorized();

        db.AuditEntries.Add(new AuditEntry { At = time.GetUtcNow(), Actor = actor!, Action = AuditAction.LoggedIn });
        await db.SaveChangesAsync();

        var (token, expiresAt) = tokens.CreateToken(actor!);
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
    public ActionResult<MeDto> Me()
    {
        var actor = User.FindFirst(AdminTokenService.ActorClaim)!.Value;
        var username = actor == AdminActor.Master ? admin.Value.MasterUsername : admin.Value.OwnerUsername;
        return new MeDto(AdminTokenService.AdminRole, actor, username);
    }

    /// <summary>
    /// The site owner replaces their password. Asks for the current one so a session left open
    /// cannot lock the owner out; rate-limited like login since it checks a password.
    /// The master's password is set in configuration and cannot be changed here.
    /// </summary>
    [HttpPut("password")]
    [Authorize(Roles = AdminTokenService.AdminRole)]
    [EnableRateLimiting(LoginRateLimitPolicy)]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request)
    {
        if (CurrentActor != AdminActor.Owner)
            return StatusCode(StatusCodes.Status403Forbidden, new { code = "ownerOnly" });

        var errors = new Errors();
        if (string.IsNullOrEmpty(request.CurrentPassword))
            errors.Add("currentPassword", "required");
        ValidateNewPassword(errors, request.NewPassword);
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

    /// <summary>The master sets a new owner password, for an owner who forgot theirs. Only the master can.</summary>
    [HttpPut("owner-password")]
    [Authorize(Roles = AdminTokenService.AdminRole)]
    public async Task<IActionResult> ResetOwnerPassword(ResetOwnerPasswordRequest request)
    {
        if (CurrentActor != AdminActor.Master)
            return StatusCode(StatusCodes.Status403Forbidden, new { code = "masterOnly" });

        var errors = new Errors();
        ValidateNewPassword(errors, request.NewPassword);
        if (errors.Any)
            return ValidationProblem(new ValidationProblemDetails(errors.ToDictionary()));

        var settings = await db.Settings.SingleAsync();
        settings.AdminPasswordHash = AdminPasswordHasher.Hash(request.NewPassword!);
        await db.SaveChangesAsync();
        return NoContent();
    }

    private string? CurrentActor => User.FindFirst(AdminTokenService.ActorClaim)?.Value;

    private string? ActorFor(string? username)
    {
        var name = username?.Trim();
        if (string.IsNullOrEmpty(name))
            return null;
        if (string.Equals(name, admin.Value.OwnerUsername, StringComparison.OrdinalIgnoreCase))
            return AdminActor.Owner;
        if (string.Equals(name, admin.Value.MasterUsername, StringComparison.OrdinalIgnoreCase))
            return AdminActor.Master;
        return null;
    }

    private static void ValidateNewPassword(Errors errors, string? password)
    {
        if (string.IsNullOrEmpty(password))
            errors.Add("newPassword", "required");
        else if (password.Length < MinPasswordLength)
            errors.Add("newPassword", "passwordTooShort");
        else if (password.Length > MaxPasswordLength)
            errors.Add("newPassword", "tooLong");
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
