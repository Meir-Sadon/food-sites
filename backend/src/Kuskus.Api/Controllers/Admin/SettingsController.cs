using System.Text.RegularExpressions;
using Kuskus.Api.Data;
using Kuskus.Api.Images;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using static Kuskus.Api.Controllers.Admin.Ordering;

namespace Kuskus.Api.Controllers.Admin;

[Route("api/admin/settings")]
public partial class SettingsController(AppDbContext db, IImageStore images) : AdminControllerBase
{
    public const int TextMaxLength = 1000;

    public record SettingsDto(
        string? BackgroundImageUrl,
        bool DeliveryEnabled,
        bool PickupEnabled,
        string? DeliveryAreaText,
        string? DeliveryFeeText,
        string? KashrutText,
        string? PaymentPhone);

    public record SettingsInput(
        bool DeliveryEnabled,
        bool PickupEnabled,
        string? DeliveryAreaText,
        string? DeliveryFeeText,
        string? KashrutText,
        string? PaymentPhone);

    [HttpGet]
    public async Task<SettingsDto> Get() => ToDto(await db.Settings.SingleAsync());

    [HttpPut]
    public async Task<ActionResult<SettingsDto>> Update(SettingsInput input)
    {
        var errors = new Errors();
        if (!input.DeliveryEnabled && !input.PickupEnabled)
            errors.Add(nameof(input.DeliveryEnabled), "fulfillmentRequired");
        errors.Text(nameof(input.DeliveryAreaText), input.DeliveryAreaText, TextMaxLength);
        errors.Text(nameof(input.DeliveryFeeText), input.DeliveryFeeText, TextMaxLength);
        errors.Text(nameof(input.KashrutText), input.KashrutText, TextMaxLength);
        if (!string.IsNullOrWhiteSpace(input.PaymentPhone) && !PhonePattern().IsMatch(input.PaymentPhone.Trim()))
            errors.Add(nameof(input.PaymentPhone), "phone");
        if (errors.Any)
            return Invalid(errors);

        var settings = await db.Settings.SingleAsync();
        settings.DeliveryEnabled = input.DeliveryEnabled;
        settings.PickupEnabled = input.PickupEnabled;
        settings.DeliveryAreaText = Clean(input.DeliveryAreaText);
        settings.DeliveryFeeText = Clean(input.DeliveryFeeText);
        settings.KashrutText = Clean(input.KashrutText);
        settings.PaymentPhone = Clean(input.PaymentPhone);
        await db.SaveChangesAsync();
        return ToDto(settings);
    }

    [HttpPut("background")]
    [RequestSizeLimit(ImageUploadRules.MaxRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = ImageUploadRules.MaxRequestBytes)]
    public async Task<ActionResult<SettingsDto>> UploadBackground(IFormFile? file, CancellationToken ct)
    {
        if (ImageUploadRules.Validate(file) is { } code)
            return Invalid("file", code);

        StoredImage stored;
        try
        {
            await using var stream = file!.OpenReadStream();
            stored = await images.UploadAsync(stream, file.FileName, "kuskus/background", ct);
        }
        catch (ImageStoreUnavailableException)
        {
            return ImageStoreUnavailable();
        }

        var settings = await db.Settings.SingleAsync(ct);
        var previous = settings.BackgroundImagePublicId;
        settings.BackgroundImageUrl = stored.Url;
        settings.BackgroundImagePublicId = stored.PublicId;
        await db.SaveChangesAsync(ct);

        if (previous is not null)
            await images.DeleteAsync(previous, ct);
        return ToDto(settings);
    }

    [HttpDelete("background")]
    public async Task<ActionResult<SettingsDto>> RemoveBackground(CancellationToken ct)
    {
        var settings = await db.Settings.SingleAsync(ct);
        var previous = settings.BackgroundImagePublicId;
        settings.BackgroundImageUrl = null;
        settings.BackgroundImagePublicId = null;
        await db.SaveChangesAsync(ct);

        if (previous is not null)
            await images.DeleteAsync(previous, ct);
        return ToDto(settings);
    }

    private static SettingsDto ToDto(Data.Entities.Settings s) => new(
        s.BackgroundImageUrl, s.DeliveryEnabled, s.PickupEnabled,
        s.DeliveryAreaText, s.DeliveryFeeText, s.KashrutText, s.PaymentPhone);

    // Digits with optional +, spaces or dashes, e.g. 050-1234567 or +972 50 123 4567.
    [GeneratedRegex(@"^\+?[0-9][0-9\- ]{7,18}[0-9]$")]
    private static partial Regex PhonePattern();
}
