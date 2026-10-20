using System.Text.RegularExpressions;
using FoodSite.Api.Data;
using FoodSite.Api.Images;
using FoodSite.Api.Mail;
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
    public const int OwnerEmailMaxLength = 500;

    public record SettingsDto(
        string? BackgroundImageUrl,
        bool DeliveryEnabled,
        bool PickupEnabled,
        string? DeliveryAreaText,
        string? DeliveryFeeText,
        string? KashrutText,
        string? PaymentPhone,
        bool BitEnabled,
        bool PayBoxEnabled,
        string? BitLink,
        string? PayBoxLink,
        decimal? MinimumOrderAmount,
        bool MinimumOrderAppliesToPickup,
        string ServiceCities,
        int? OrdersPerHour,
        int? PortionsPerSupplyDate,
        string Style,
        string OrderTotalPosition,
        string OrderFlow,
        string Corners,
        string OwnerEmail,
        bool OwnerChangeMails,
        string Palette,
        IReadOnlyDictionary<string, string> CustomColors,
        int? LineWidth,
        string Font,
        string Shadows,
        string Spacing,
        string TileGroups,
        string DeliveryPricing,
        decimal? DeliveryFeeAmount,
        decimal? DeliveryBaseFee,
        decimal? DeliveryDiscountMinOrder,
        bool AddressFirst,
        Tracking.Ids Tracking,
        ItemBadges.Effective Badges);

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
        string? Style = null,
        string? OrderTotalPosition = null,
        string? OrderFlow = null,
        string? Corners = null,
        string? OwnerEmail = null,
        bool? OwnerChangeMails = null,
        string? Palette = null,
        Dictionary<string, string>? CustomColors = null,
        int? LineWidth = null,
        string? Font = null,
        string? Shadows = null,
        string? Spacing = null,
        string? TileGroups = null,
        bool? BitEnabled = null,
        bool? PayBoxEnabled = null,
        string? BitLink = null,
        string? PayBoxLink = null,
        string? DeliveryPricing = null,
        bool? AddressFirst = null,
        decimal? DeliveryFeeAmount = null,
        decimal? DeliveryBaseFee = null,
        decimal? DeliveryDiscountMinOrder = null);

    public const int LinkMaxLength = 500;

    [HttpGet]
    public async Task<SettingsDto> Get() => await ToDtoAsync(await db.Settings.SingleAsync());

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
        if (!string.IsNullOrWhiteSpace(input.BitLink) && !IsHttpsLink(input.BitLink.Trim()))
            errors.Add(nameof(input.BitLink), "link");
        if (!string.IsNullOrWhiteSpace(input.PayBoxLink) && !IsHttpsLink(input.PayBoxLink.Trim()))
            errors.Add(nameof(input.PayBoxLink), "link");
        // Missing (an older client) keeps the current choice.
        var bitOn = input.BitEnabled ?? await db.Settings.AsNoTracking().Select(s => s.BitEnabled).SingleAsync();
        var payBoxOn = input.PayBoxEnabled ?? await db.Settings.AsNoTracking().Select(s => s.PayBoxEnabled).SingleAsync();
        if ((bitOn || payBoxOn) && string.IsNullOrWhiteSpace(input.PaymentPhone))
            errors.Add(nameof(input.PaymentPhone), "required");
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
        if (input.OrderTotalPosition is not null && !OrderLayout.IsKnownTotalPosition(input.OrderTotalPosition))
            errors.Add(nameof(input.OrderTotalPosition), "invalid");
        if (input.OrderFlow is not null && !OrderLayout.IsKnownFlow(input.OrderFlow))
            errors.Add(nameof(input.OrderFlow), "invalid");
        if (input.Corners is not null && !Sites.Corners.IsKnown(input.Corners))
            errors.Add(nameof(input.Corners), "invalid");
        if (input.Palette is not null && !Palettes.IsKnown(input.Palette))
            errors.Add(nameof(input.Palette), "invalid");
        if (input.CustomColors is not null
            && (input.CustomColors.Any(c => !Palettes.ColorKeys.Contains(c.Key) || !Palettes.IsColorOrCopy(c.Value))
                || Palettes.HasCopyCycle(input.CustomColors)))
            errors.Add(nameof(input.CustomColors), "invalid");
        if (input.LineWidth is < 0 or > Palettes.MaxLineWidth)
            errors.Add(nameof(input.LineWidth), "invalid");
        if (input.Font is not null && !Finish.IsKnownFont(input.Font))
            errors.Add(nameof(input.Font), "invalid");
        if (input.Shadows is not null && !Finish.IsKnownShadows(input.Shadows))
            errors.Add(nameof(input.Shadows), "invalid");
        if (input.Spacing is not null && !Finish.IsKnownSpacing(input.Spacing))
            errors.Add(nameof(input.Spacing), "invalid");
        if (input.TileGroups is not null && !Finish.IsKnownTileGroups(input.TileGroups))
            errors.Add(nameof(input.TileGroups), "invalid");
        if (input.OwnerEmail is not null && !string.IsNullOrWhiteSpace(input.OwnerEmail) && !OwnerRecipients.IsValid(input.OwnerEmail, OwnerEmailMaxLength))
            errors.Add(nameof(input.OwnerEmail), "email");
        if (input.DeliveryPricing is not null && !Delivery.DeliveryPricing.IsKnown(input.DeliveryPricing))
            errors.Add(nameof(input.DeliveryPricing), "invalid");
        if (input.DeliveryFeeAmount is < 0m or > Delivery.DeliveryZones.MaxFee)
            errors.Add(nameof(input.DeliveryFeeAmount), "invalid");
        if (input.DeliveryBaseFee is < 0m or > Delivery.DeliveryZones.MaxFee)
            errors.Add(nameof(input.DeliveryBaseFee), "invalid");
        if (input.DeliveryDiscountMinOrder is < 0m or > Delivery.DeliveryZones.MaxFee * 100)
            errors.Add(nameof(input.DeliveryDiscountMinOrder), "invalid");
        if (errors.Any)
            return Invalid(errors);

        var settings = await db.Settings.SingleAsync();
        settings.DeliveryEnabled = input.DeliveryEnabled;
        settings.PickupEnabled = input.PickupEnabled;
        settings.DeliveryAreaText = Clean(input.DeliveryAreaText);
        settings.DeliveryFeeText = Clean(input.DeliveryFeeText);
        // Zero (or empty) means no fixed fee.
        settings.DeliveryFeeAmount = input.DeliveryFeeAmount is > 0m ? decimal.Round(input.DeliveryFeeAmount.Value, 2) : null;
        // Zero (or empty) means no discount.
        settings.DeliveryBaseFee = input.DeliveryBaseFee is > 0m ? decimal.Round(input.DeliveryBaseFee.Value, 2) : null;
        settings.DeliveryDiscountMinOrder = input.DeliveryDiscountMinOrder is > 0m ? decimal.Round(input.DeliveryDiscountMinOrder.Value, 2) : null;
        settings.KashrutText = Clean(input.KashrutText);
        settings.PaymentPhone = Clean(input.PaymentPhone);
        settings.BitEnabled = bitOn;
        settings.PayBoxEnabled = payBoxOn;
        if (input.BitLink is not null) settings.BitLink = Clean(input.BitLink);
        if (input.PayBoxLink is not null) settings.PayBoxLink = Clean(input.PayBoxLink);
        // Zero (or empty) means no minimum.
        settings.MinimumOrderAmount = input.MinimumOrderAmount is > 0m ? decimal.Round(input.MinimumOrderAmount.Value, 2) : null;
        // Missing (an older client) keeps the current choice.
        if (input.AddressFirst is { } addressFirst)
            settings.AddressFirst = addressFirst;
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
        // Likewise the order layout.
        if (input.OrderTotalPosition is not null)
            settings.OrderTotalPosition = input.OrderTotalPosition;
        if (input.OrderFlow is not null)
            settings.OrderFlow = input.OrderFlow;
        if (input.Corners is not null)
            settings.Corners = input.Corners;
        // Missing keeps the colours; an empty set clears the custom colours, zero the line thickness.
        if (input.Palette is not null)
            settings.Palette = input.Palette;
        if (input.CustomColors is not null)
            settings.CustomColors = Palettes.Format(input.CustomColors);
        if (input.LineWidth is { } lineWidth)
            settings.LineWidth = lineWidth == 0 ? null : lineWidth;
        // Likewise the font, shadows and spacing.
        if (input.Font is not null)
            settings.FontPair = input.Font;
        if (input.Shadows is not null)
            settings.ShadowStrength = input.Shadows;
        if (input.Spacing is not null)
            settings.Spacing = input.Spacing;
        if (input.TileGroups is not null)
            settings.TileGroups = input.TileGroups;
        // Missing (an older client) keeps the address; an empty one turns the mails off.
        if (input.OwnerEmail is not null)
            settings.OwnerEmail = Clean(OwnerRecipients.Normalize(input.OwnerEmail));
        // Missing (an older client) keeps the choice; off until the admin ticks it.
        if (input.OwnerChangeMails is not null)
            settings.OwnerChangeMails = input.OwnerChangeMails.Value;
        // Missing (an older client) keeps the mode.
        if (input.DeliveryPricing is not null)
            settings.DeliveryPricing = input.DeliveryPricing;
        await db.SaveChangesAsync();
        return await ToDtoAsync(settings);
    }

    /// <summary>
    /// The marketing ids have their own save, so saving another section never overwrites them with an older copy.
    /// A missing id keeps that tool as it is; an empty one turns it off.
    /// </summary>
    [HttpPut("tracking")]
    public async Task<ActionResult<SettingsDto>> UpdateTracking(Tracking.IdsInput tracking)
    {
        var errors = new Errors();
        if (tracking.MetaPixelId is not null && !Sites.Tracking.IsMeta(Sites.Tracking.Normalize(tracking.MetaPixelId, false)))
            errors.Add("MetaPixelId", "trackingId");
        if (tracking.GoogleAnalyticsId is not null && !Sites.Tracking.IsAnalytics(Sites.Tracking.Normalize(tracking.GoogleAnalyticsId, true)))
            errors.Add("GoogleAnalyticsId", "trackingId");
        if (tracking.GoogleTagManagerId is not null && !Sites.Tracking.IsTagManager(Sites.Tracking.Normalize(tracking.GoogleTagManagerId, true)))
            errors.Add("GoogleTagManagerId", "trackingId");
        if (tracking.TikTokPixelId is not null && !Sites.Tracking.IsTikTok(Sites.Tracking.Normalize(tracking.TikTokPixelId, true)))
            errors.Add("TikTokPixelId", "trackingId");
        if (tracking.GoogleAdsId is not null && !Sites.Tracking.IsAds(Sites.Tracking.Normalize(tracking.GoogleAdsId, true)))
            errors.Add("GoogleAdsId", "trackingId");
        if (tracking.GoogleAdsPurchaseLabel is not null && !Sites.Tracking.IsAdsLabel(Sites.Tracking.Normalize(tracking.GoogleAdsPurchaseLabel, false)))
            errors.Add("GoogleAdsPurchaseLabel", "trackingId");
        if (tracking.MetaAccessToken is not null && !Sites.Tracking.IsMetaToken(Sites.Tracking.Normalize(tracking.MetaAccessToken, false)))
            errors.Add("MetaAccessToken", "trackingId");
        if (errors.Any)
            return Invalid(errors);

        var settings = await db.Settings.SingleAsync();
        if (tracking.GoogleAdsId is not null)
            settings.GoogleAdsId = Clean(Sites.Tracking.Normalize(tracking.GoogleAdsId, true));
        if (tracking.GoogleAdsPurchaseLabel is not null)
            settings.GoogleAdsPurchaseLabel = Clean(Sites.Tracking.Normalize(tracking.GoogleAdsPurchaseLabel, false));
        if (tracking.MetaAccessToken is not null)
            settings.MetaAccessToken = Clean(Sites.Tracking.Normalize(tracking.MetaAccessToken, false));
        if (tracking.MetaPixelId is not null)
            settings.MetaPixelId = Clean(Sites.Tracking.Normalize(tracking.MetaPixelId, false));
        if (tracking.GoogleAnalyticsId is not null)
            settings.GoogleAnalyticsId = Clean(Sites.Tracking.Normalize(tracking.GoogleAnalyticsId, true));
        if (tracking.GoogleTagManagerId is not null)
            settings.GoogleTagManagerId = Clean(Sites.Tracking.Normalize(tracking.GoogleTagManagerId, true));
        if (tracking.TikTokPixelId is not null)
            settings.TikTokPixelId = Clean(Sites.Tracking.Normalize(tracking.TikTokPixelId, true));
        await db.SaveChangesAsync();
        return await ToDtoAsync(settings);
    }

    /// <summary>
    /// The item badges have their own save, so another section never overwrites them with an older copy. A missing
    /// field keeps its value.
    /// </summary>
    [HttpPut("badges")]
    public async Task<ActionResult<SettingsDto>> UpdateBadges(ItemBadges.Input input)
    {
        var settings = await db.Settings.SingleAsync();
        var current = ItemBadges.Of(settings);
        var errors = new Errors();
        if (input.NewUnit is not null && !ItemBadges.Units.Contains(input.NewUnit))
            errors.Add(nameof(input.NewUnit), "invalid");
        if (input.NewAmount is < 1 or > ItemBadges.MaxNewAmount)
            errors.Add(nameof(input.NewAmount), "invalid");
        if (input.LowStockMode is not null && !ItemBadges.Modes.Contains(input.LowStockMode))
            errors.Add(nameof(input.LowStockMode), "invalid");
        else if (!ItemBadges.LowStockAmountValid(input.LowStockMode ?? current.LowStockMode, input.LowStockAmount ?? current.LowStockAmount))
            errors.Add(nameof(input.LowStockAmount), "invalid");
        if (errors.Any)
            return Invalid(errors);

        settings.BadgeNewEnabled = input.NewEnabled ?? settings.BadgeNewEnabled;
        settings.BadgeNewAmount = input.NewAmount ?? current.NewAmount;
        settings.BadgeNewUnit = input.NewUnit ?? current.NewUnit;
        settings.BadgeLowStockEnabled = input.LowStockEnabled ?? settings.BadgeLowStockEnabled;
        settings.BadgeLowStockMode = input.LowStockMode ?? current.LowStockMode;
        settings.BadgeLowStockAmount = input.LowStockAmount ?? current.LowStockAmount;
        await db.SaveChangesAsync();
        return await ToDtoAsync(settings);
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
        return await ToDtoAsync(settings);
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
        return await ToDtoAsync(settings);
    }

    private async Task<SettingsDto> ToDtoAsync(Data.Entities.Settings s) => new(
        s.BackgroundImageUrl, s.DeliveryEnabled, s.PickupEnabled,
        s.DeliveryAreaText, s.DeliveryFeeText, s.KashrutText, s.PaymentPhone, s.BitEnabled, s.PayBoxEnabled, s.BitLink, s.PayBoxLink, s.MinimumOrderAmount,
        s.MinimumOrderAppliesToPickup, s.ServiceCities ?? "", s.OrdersPerHour, s.PortionsPerSupplyDate,
        SiteStyles.Effective(s.SiteStyle, site.Value.Settings.Style),
        OrderLayout.EffectiveTotalPosition(s.OrderTotalPosition, site.Value.Settings.OrderTotalPosition),
        OrderLayout.EffectiveFlow(s.OrderFlow, site.Value.Settings.OrderFlow),
        Sites.Corners.Effective(s.Corners, site.Value.Settings.Corners),
        s.OwnerEmail ?? "",
        s.OwnerChangeMails,
        Palettes.Effective(s.Palette, site.Value.Settings.Palette),
        Palettes.Parse(s.CustomColors),
        s.LineWidth,
        Finish.Effective(s.FontPair, Finish.IsKnownFont),
        Finish.Effective(s.ShadowStrength, Finish.IsKnownShadows),
        Finish.Effective(s.Spacing, Finish.IsKnownSpacing),
        Finish.EffectiveTileGroups(s.TileGroups),
        s.DeliveryPricing ?? Delivery.DeliveryPricing.Simple,
        s.DeliveryFeeAmount,
        s.DeliveryBaseFee,
        s.DeliveryDiscountMinOrder,
        s.AddressFirst,
        Sites.Tracking.Of(s),
        ItemBadges.Of(s));

    private static bool IsHttpsLink(string value) =>
        value.Length <= LinkMaxLength
        && Uri.TryCreate(value, UriKind.Absolute, out var uri)
        && uri.Scheme == Uri.UriSchemeHttps;


    // Digits with optional +, spaces or dashes, e.g. 050-1234567 or +972 50 123 4567.
    [GeneratedRegex(@"^\+?[0-9][0-9\- ]{7,18}[0-9]$")]
    private static partial Regex PhonePattern();
}
