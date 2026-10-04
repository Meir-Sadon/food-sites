using Kuskus.Api.Auth;
using Kuskus.Api.Phones;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Kuskus.Api.Controllers;

[Route("api/phone-verification")]
[EnableRateLimiting(PublicControllerBase.WriteRateLimitPolicy)]
public class PhoneVerificationController(PhoneVerificationService verification, ILogger<PhoneVerificationController> logger)
    : PublicControllerBase
{
    public record SendRequest(string? Phone);

    public record ConfirmRequest(string? Phone, string? Code);

    public record ConfirmedDto(string Token);

    [HttpPost("send")]
    public async Task<ActionResult> Send(SendRequest request, CancellationToken ct)
    {
        if (PhoneNumber.Normalize(request.Phone) is not { } phone)
            return Invalid(nameof(request.Phone), "phone");

        try
        {
            return await verification.SendCodeAsync(phone, ct) == SendCodeResult.TooManyCodes
                ? StatusCode(StatusCodes.Status429TooManyRequests, new { code = "tooManyCodes" })
                : NoContent();
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Sending a login code failed");
            return StatusCode(StatusCodes.Status502BadGateway, new { code = "messageFailed" });
        }
    }

    [HttpPost("confirm")]
    public async Task<ActionResult<ConfirmedDto>> Confirm(ConfirmRequest request, CancellationToken ct)
    {
        if (PhoneNumber.Normalize(request.Phone) is not { } phone)
            return Invalid(nameof(request.Phone), "phone");

        var (result, token) = await verification.ConfirmAsync(phone, request.Code, ct);
        if (result == ConfirmCodeResult.Confirmed)
            return new ConfirmedDto(token!);
        return Invalid(nameof(request.Code), result == ConfirmCodeResult.Expired ? "codeExpired" : "codeWrong");
    }
}
