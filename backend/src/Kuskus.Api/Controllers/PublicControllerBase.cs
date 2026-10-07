using Kuskus.Api.Auth;
using Kuskus.Api.Controllers.Admin;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Mvc;

namespace Kuskus.Api.Controllers;

/// <summary>Base for the client site's endpoints. Errors are short codes the site translates.</summary>
[ApiController]
public abstract class PublicControllerBase : ControllerBase
{
    public const string WriteRateLimitPolicy = "public-write";

    protected ActionResult Invalid(Errors errors) =>
        ValidationProblem(new ValidationProblemDetails(errors.ToDictionary()));

    protected ActionResult Invalid(string field, string code) => Invalid(new Errors().Add(field, code));

    protected ActionResult Conflict(string code) => Conflict(new { code });

    /// <summary>The id of the logged-in client, or null for a guest. Pages that also serve guests use this instead of [Authorize].</summary>
    protected async Task<int?> SessionUserIdAsync()
    {
        var result = await HttpContext.AuthenticateAsync(UserTokenService.Scheme);
        return result.Succeeded && int.TryParse(result.Principal?.FindFirst("sub")?.Value, out var id) ? id : null;
    }
}
