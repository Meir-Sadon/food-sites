using FoodSite.Api.Auth;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Usage;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace FoodSite.Api.Controllers;

/// <summary>
/// The client site reports a visit, a started order and a sent order here, with the random id the browser keeps for
/// itself. The admin's own visits and robots are not counted; the answer is the same either way.
/// </summary>
[Route("api/usage")]
public class UsageController(UsageRecorder recorder) : PublicControllerBase
{
    public record UsageInput(string? DeviceId, UsageEventKind? Kind);

    [HttpPost]
    [EnableRateLimiting(UsageRateLimitPolicy)]
    public async Task<IActionResult> Record(UsageInput input, CancellationToken ct)
    {
        var errors = new Admin.Errors();
        if (!UsageRecorder.IsDeviceId(input.DeviceId))
            errors.Add(nameof(input.DeviceId), "invalid");
        if (input.Kind is not { } kind || !Enum.IsDefined(kind))
            errors.Add(nameof(input.Kind), "invalid");
        if (errors.Any)
            return Invalid(errors);

        if (!User.IsInRole(AdminTokenService.AdminRole) && !UsageRecorder.IsBot(Request.Headers.UserAgent))
            await recorder.RecordAsync(input.DeviceId!, input.Kind!.Value, ct);
        return NoContent();
    }
}
