using FoodSite.Api.Auth;
using FoodSite.Api.Data;
using FoodSite.Api.Ops;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FoodSite.Api.Controllers.Admin;

/// <summary>
/// The console's token for this site (<see cref="OpsToken"/>). Only the master manages it: creating one replaces
/// the previous one, and the token itself is shown once, in the answer to the request that created it.
/// </summary>
[Route("api/admin/ops-token")]
public class OpsTokenController(AppDbContext db, TimeProvider time) : AdminControllerBase
{
    /// <param name="CreatedAt">When the current token was created; null while the site has none.</param>
    public record OpsTokenDto(DateTimeOffset? CreatedAt);

    public record NewOpsTokenDto(string Token, DateTimeOffset CreatedAt);

    [HttpGet]
    public async Task<ActionResult<OpsTokenDto>> Get()
    {
        if (!IsMaster)
            return MasterOnly();
        var settings = await db.Settings.AsNoTracking().SingleAsync();
        return new OpsTokenDto(settings.OpsTokenHash is null ? null : settings.OpsTokenCreatedAt);
    }

    [HttpPost]
    public async Task<ActionResult<NewOpsTokenDto>> Create()
    {
        if (!IsMaster)
            return MasterOnly();
        var token = OpsToken.Create();
        var settings = await db.Settings.SingleAsync();
        settings.OpsTokenHash = OpsToken.Hash(token);
        settings.OpsTokenCreatedAt = time.GetUtcNow();
        await db.SaveChangesAsync();
        return new NewOpsTokenDto(token, settings.OpsTokenCreatedAt.Value);
    }

    [HttpDelete]
    public async Task<IActionResult> Revoke()
    {
        if (!IsMaster)
            return MasterOnly();
        var settings = await db.Settings.SingleAsync();
        settings.OpsTokenHash = null;
        settings.OpsTokenCreatedAt = null;
        await db.SaveChangesAsync();
        return NoContent();
    }

    private bool IsMaster => User.FindFirst(AdminTokenService.ActorClaim)?.Value == AdminActor.Master;

    private ObjectResult MasterOnly() => StatusCode(StatusCodes.Status403Forbidden, new { code = "masterOnly" });
}
