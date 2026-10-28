using FoodSite.Api.Auth;
using FoodSite.Api.Controllers.Admin;
using FoodSite.Api.Data;
using FoodSite.Api.Orders;
using FoodSite.Api.Sites;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FoodSite.Api.Controllers;

/// <summary>Base for the client site's endpoints. Errors are short codes the site translates.</summary>
[ApiController]
public abstract class PublicControllerBase : ControllerBase
{
    public const string WriteRateLimitPolicy = "public-write";
    public const string UsageRateLimitPolicy = "public-usage";

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

    /// <summary>
    /// The logged-in client's price lists for today, while the site has them on; a guest (or the phone typed into an
    /// order) never gets them, so only the session's own account decides.
    /// </summary>
    protected async Task<PriceBook> SessionPricesAsync(AppDbContext db, FeatureFlags features, SiteClock clock, CancellationToken ct = default)
    {
        if (!await features.IsEnabledAsync(Features.PriceLists, ct) || await SessionUserIdAsync() is not { } userId)
            return PriceBook.Regular;
        return await PriceBook.ForClientAsync(db, userId, clock.UtcNow(), clock.Today(), ct);
    }
}
