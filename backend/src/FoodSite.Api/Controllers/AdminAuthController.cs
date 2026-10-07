using FoodSite.Api.Auth;
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

    public record LoginRequest(string Password);

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

    private Microsoft.AspNetCore.Http.CookieOptions CookieFor(DateTimeOffset? expires) => new()
    {
        HttpOnly = true,
        Secure = cookie.Value.Secure,
        SameSite = cookie.Value.SameSite,
        Path = "/api",
        Expires = expires,
    };
}
