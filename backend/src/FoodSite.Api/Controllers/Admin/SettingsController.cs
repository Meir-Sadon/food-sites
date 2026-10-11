using System.Text.RegularExpressions;
using FoodSite.Api.Data;
using FoodSite.Api.Images;
using FoodSite.Api.Orders;
using FoodSite.Api.Sites;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using static FoodSite.Api.Controllers.Admin.Ordering;

namespace FoodSite.Api.Controllers.Admin;

[Route("api/admin/settings")]
public partial class SettingsController(AppDbContext db, IImageStore images, IOptions<SiteOptions> site) : AdminControllerBase
{
    public const int TextMaxLength = 1000;
    public const decimal MaxMinimumOrder = 100_000;
    public const int MaxOrdersPerHour = 1000;
    public const int MaxPortionsPerSupplyDate = 100_000;

    public record SettingsDto(
        string? BackgroundImageUrl,
        bool DeliveryEnabled,
        bool PickupEnabled,
        string? DeliveryAreaText,
        string? DeliveryFeeText,
        string? KashrutText,
        string? PaymentPhone,
        decimal? MinimumOrderAmount,
        bool MinimumOrderAppliesToPickup,
        string ServiceCities,
        int? OrdersPerHour,
        int? PortionsPerSupplyDate,
        string Style);

    public record SettingsInput(
        bool DeliveryEnabled,
        bool PickupEnabled,
        string? DeliveryAreaText,
        string? DeliveryFeeText,
        string? KashrutText,
        string? PaymentPhone,
        decimal? MinimumOrderAmount,
        string? ServiceCities = null,
        bool? MinimumOrderAppliesToPickup = null,
        int? OrdersPerHour = null,
        int? PortionsPerSupplyDate = null,
        string? Style = null);

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
        if (input.MinimumOrderAmount is < 0m or > MaxMinimumOrder)
            errors.Add(nameof(input.MinimumOrderAmount), "invalid");
        if (input.OrdersPerHour is < 0 or > MaxOrdersPerHour)
            errors.Add(nameof(input.OrdersPerHour), "invalid");
        if (input.PortionsPerSupplyDate is < 0 or > MaxPortionsPerSupplyDate)
            errors.Add(nameof(input.PortionsPerSupplyDate), "invalid");
        var serviceCities = ServiceArea.Format(ServiceArea.Parse(input.ServiceCities));
        if (serviceCities.Length > ServiceArea.MaxLength
            || ServiceArea.Parse(serviceCities).Any(c => c.Length > AddressFormat.PartMaxLength))
            errors.Add(nameof(input.ServiceCities), "tooLong");
        if (input.Style is not null && !SiteStyles.IsKnown(input.Style))
            errors.Add(nameof(input.Style), "invalid");
        if (errors.Any)
            return Invalid(errors);

        var settings = await db.Settings.SingleAsync();
        settings.DeliveryEnabled = input.DeliveryEnabled;
        settings.PickupEnabled = input.PickupEnabled;
        settings.DeliveryAreaText = Clean(input.DeliveryAreaText);
        settings.DeliveryFeeText = Clean(input.DeliveryFeeText);
        settings.KashrutText = Clean(input.KashrutText);
        settings.PaymentPhone = Clean(input.PaymentPhone);
        // Zero (or empty) means no minimum.
        settings.MinimumOrderAmount = input.MinimumOrderAmount is > 0m ? decimal.Round(input.MinimumOrderAmount.Value, 2) : null;
        // Missing (an older client) keeps the current choice.
        if (input.MinimumOrderAppliesToPickup is { } appliesToPickup)
            settings.MinimumOrderAppliesToPickup = appliesToPickup;
        // Zero (or empty) means no limit.
        settings.OrdersPerHour = input.OrdersPerHour is > 0 ? input.OrdersPerHour : null;
        settings.PortionsPerSupplyDate = input.PortionsPerSupplyDate is > 0 ? input.PortionsPerSupplyDate : null;
        // Missing (an older client) keeps the cities; an empty list is kept as "", meaning every city is served.
        if (input.ServiceCities is not null)
            settings.ServiceCities = serviceCities;
        // Missing (an older client) keeps the style.
        if (input.Style is not null)
            settings.SiteStyle = input.Style;
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
            stored = await images.UploadAsync(stream, file.FileName, site.Value.ImageFolder("background"), ct);
        }
        catch (ImageStoreUnavailableException e)
        {
            return ImageStoreUnavailable(e);
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

    private SettingsDto ToDto(Data.Entities.Settings s) => new(
        s.BackgroundImageUrl, s.DeliveryEnabled, s.PickupEnabled,
        s.DeliveryAreaText, s.DeliveryFeeText, s.KashrutText, s.PaymentPhone, s.MinimumOrderAmount,
        s.MinimumOrderAppliesToPickup, s.ServiceCities ?? "", s.OrdersPerHour, s.PortionsPerSupplyDate,
        SiteStyles.Effective(s.SiteStyle, site.Value.Settings.Style));

    // Digits with optional +, spaces or dashes, e.g. 050-1234567 or +972 50 123 4567.
    [GeneratedRegex(@"^\+?[0-9][0-9\- ]{7,18}[0-9]$")]
    private static partial Regex PhonePattern();
}
