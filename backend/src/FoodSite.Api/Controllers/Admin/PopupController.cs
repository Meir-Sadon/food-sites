using FoodSite.Api.Data;
using FoodSite.Api.Images;
using FoodSite.Api.Popup;
using FoodSite.Api.Sites;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using static FoodSite.Api.Controllers.Admin.Ordering;

namespace FoodSite.Api.Controllers.Admin;

/// <summary>The pop-up shown when a client opens the site. Its text and choices are saved together; its picture on its own.</summary>
[Route("api/admin/popup")]
public class PopupController(AppDbContext db, IImageStore images, IOptions<SiteOptions> site) : AdminControllerBase
{
    public record PopupInput(
        bool Enabled, string? Size, string? Frequency, string? Trigger, int? DelaySeconds, string? Title, string? Body, string? ButtonText, string? ButtonUrl);

    [HttpGet]
    public async Task<EntryPopup.Dto> Get() => EntryPopup.Of(await db.Settings.AsNoTracking().SingleAsync());

    [HttpPut]
    public async Task<ActionResult<EntryPopup.Dto>> Update(PopupInput input)
    {
        var errors = new Errors();
        if (!string.IsNullOrWhiteSpace(input.Size) && !EntryPopup.Sizes.Contains(input.Size))
            errors.Add(nameof(input.Size), "invalid");
        if (!string.IsNullOrWhiteSpace(input.Frequency) && !EntryPopup.Frequencies.Contains(input.Frequency))
            errors.Add(nameof(input.Frequency), "invalid");
        if (!string.IsNullOrWhiteSpace(input.Trigger) && !EntryPopup.Triggers.Contains(input.Trigger))
            errors.Add(nameof(input.Trigger), "invalid");
        if (input.DelaySeconds is < 0 or > EntryPopup.MaxDelaySeconds)
            errors.Add(nameof(input.DelaySeconds), "invalid");
        // A draft can be saved while the pop-up is off; turning it on needs a title.
        errors.Text(nameof(input.Title), input.Title, EntryPopup.TitleMaxLength, required: input.Enabled);
        errors.Text(nameof(input.Body), input.Body, EntryPopup.BodyMaxLength);
        errors.Text(nameof(input.ButtonText), input.ButtonText, EntryPopup.ButtonTextMaxLength);

        var url = Clean(input.ButtonUrl);
        var text = Clean(input.ButtonText);
        if (url is not null)
        {
            url = EntryPopup.NormalizeUrl(url);
            if (url is null)
                errors.Add(nameof(input.ButtonUrl), "link");
            else if (url.Length > EntryPopup.ButtonUrlMaxLength)
                errors.Add(nameof(input.ButtonUrl), "tooLong");
            else if (text is null)
                errors.Add(nameof(input.ButtonText), "required");
        }
        else if (text is not null)
        {
            errors.Add(nameof(input.ButtonUrl), "required");
        }
        if (errors.Any)
            return Invalid(errors);

        var settings = await db.Settings.SingleAsync();
        settings.PopupEnabled = input.Enabled;
        settings.PopupSize = EntryPopup.EffectiveSize(Clean(input.Size));
        settings.PopupFrequency = EntryPopup.EffectiveFrequency(Clean(input.Frequency));
        settings.PopupTrigger = EntryPopup.EffectiveTrigger(Clean(input.Trigger));
        settings.PopupDelaySeconds = EntryPopup.EffectiveDelay(input.DelaySeconds);
        settings.PopupTitle = Clean(input.Title);
        settings.PopupBody = Clean(input.Body);
        settings.PopupButtonText = text;
        settings.PopupButtonUrl = url;
        await db.SaveChangesAsync();
        return EntryPopup.Of(settings);
    }

    [HttpPut("image")]
    [RequestSizeLimit(ImageUploadRules.MaxRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = ImageUploadRules.MaxRequestBytes)]
    public async Task<ActionResult<EntryPopup.Dto>> UploadImage(IFormFile? file, CancellationToken ct)
    {
        if (ImageUploadRules.Validate(file) is { } code)
            return Invalid("file", code);

        StoredImage stored;
        try
        {
            await using var stream = file!.OpenReadStream();
            stored = await images.UploadAsync(stream, file.FileName, site.Value.ImageFolder("popup"), ct);
        }
        catch (ImageStoreUnavailableException e)
        {
            return ImageStoreUnavailable(e);
        }

        var settings = await db.Settings.SingleAsync(ct);
        var previous = settings.PopupImagePublicId;
        settings.PopupImageUrl = stored.Url;
        settings.PopupImagePublicId = stored.PublicId;
        await db.SaveChangesAsync(ct);

        if (previous is not null)
            await images.DeleteAsync(previous, ct);
        return EntryPopup.Of(settings);
    }

    [HttpDelete("image")]
    public async Task<ActionResult<EntryPopup.Dto>> RemoveImage(CancellationToken ct)
    {
        var settings = await db.Settings.SingleAsync(ct);
        var previous = settings.PopupImagePublicId;
        settings.PopupImageUrl = null;
        settings.PopupImagePublicId = null;
        await db.SaveChangesAsync(ct);

        if (previous is not null)
            await images.DeleteAsync(previous, ct);
        return EntryPopup.Of(settings);
    }
}
