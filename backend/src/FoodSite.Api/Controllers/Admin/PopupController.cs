using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Images;
using FoodSite.Api.Popup;
using FoodSite.Api.Sites;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using static FoodSite.Api.Controllers.Admin.Ordering;

namespace FoodSite.Api.Controllers.Admin;

/// <summary>
/// The pop-ups shown when a client opens the site (up to <see cref="EntryPopup.MaxPopups"/>, one per slot). A slot's text,
/// choices and conditions are saved together; its picture on its own.
/// </summary>
[Route("api/admin/popups")]
public class PopupController(AppDbContext db, IImageStore images, IOptions<SiteOptions> site) : AdminControllerBase
{
    public record PopupInput(
        bool Enabled, string? Size, string? Frequency, string? Trigger, int? DelaySeconds, string? Title, string? Body, string? ButtonText, string? ButtonUrl,
        string? Login = null, string? Activity = null, string? OrderSource = null, bool? OrderTotal = null, decimal? MinTotal = null, decimal? MaxTotal = null);

    [HttpGet]
    public async Task<List<EntryPopup.Dto>> List() => EntryPopup.ForAdmin(await db.PopupSlots.AsNoTracking().ToListAsync());

    [HttpPut("{slot:int}")]
    public async Task<ActionResult<EntryPopup.Dto>> Update(int slot, PopupInput input)
    {
        if (slot is < 1 or > EntryPopup.MaxPopups)
            return NotFound();

        var errors = new Errors();
        if (!string.IsNullOrWhiteSpace(input.Size) && !EntryPopup.Sizes.Contains(input.Size))
            errors.Add(nameof(input.Size), "invalid");
        if (!string.IsNullOrWhiteSpace(input.Frequency) && !EntryPopup.Frequencies.Contains(input.Frequency))
            errors.Add(nameof(input.Frequency), "invalid");
        if (!string.IsNullOrWhiteSpace(input.Trigger) && !EntryPopup.Triggers.Contains(input.Trigger))
            errors.Add(nameof(input.Trigger), "invalid");
        if (input.DelaySeconds is < 0 or > EntryPopup.MaxDelaySeconds)
            errors.Add(nameof(input.DelaySeconds), "invalid");
        if (!string.IsNullOrWhiteSpace(input.Login) && !EntryPopup.LoginChoices.Contains(input.Login))
            errors.Add(nameof(input.Login), "invalid");
        if (!string.IsNullOrWhiteSpace(input.Activity) && !EntryPopup.ActivityChoices.Contains(input.Activity))
            errors.Add(nameof(input.Activity), "invalid");
        if (!string.IsNullOrWhiteSpace(input.OrderSource) && !EntryPopup.OrderSources.Contains(input.OrderSource))
            errors.Add(nameof(input.OrderSource), "invalid");
        if (input.MinTotal is < 0m or > EntryPopup.MaxTotal)
            errors.Add(nameof(input.MinTotal), "invalid");
        if (input.MaxTotal is < 0m or > EntryPopup.MaxTotal)
            errors.Add(nameof(input.MaxTotal), "invalid");
        else if (input.MinTotal is > 0m && input.MaxTotal is > 0m && input.MinTotal >= input.MaxTotal)
            errors.Add(nameof(input.MaxTotal), "invalid");
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

        var popup = await FindOrAddAsync(slot, CancellationToken.None);
        popup.Enabled = input.Enabled;
        popup.Size = EntryPopup.EffectiveSize(Clean(input.Size));
        popup.Frequency = EntryPopup.EffectiveFrequency(Clean(input.Frequency));
        popup.Trigger = EntryPopup.EffectiveTrigger(Clean(input.Trigger));
        popup.DelaySeconds = EntryPopup.EffectiveDelay(input.DelaySeconds);
        popup.Title = Clean(input.Title);
        popup.Body = Clean(input.Body);
        popup.ButtonText = text;
        popup.ButtonUrl = url;
        popup.Login = EntryPopup.EffectiveChoice(Clean(input.Login), EntryPopup.LoginChoices);
        popup.Activity = EntryPopup.EffectiveChoice(Clean(input.Activity), EntryPopup.ActivityChoices);
        popup.OrderSource = EntryPopup.EffectiveChoice(Clean(input.OrderSource), EntryPopup.OrderSources);
        popup.OrderTotal = input.OrderTotal ?? false;
        // Zero (or empty) means no limit on that side.
        popup.MinTotal = popup.OrderTotal && input.MinTotal is > 0m ? decimal.Round(input.MinTotal.Value, 2) : null;
        popup.MaxTotal = popup.OrderTotal && input.MaxTotal is > 0m ? decimal.Round(input.MaxTotal.Value, 2) : null;
        await db.SaveChangesAsync();
        return EntryPopup.Of(popup);
    }

    [HttpPut("{slot:int}/image")]
    [RequestSizeLimit(ImageUploadRules.MaxRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = ImageUploadRules.MaxRequestBytes)]
    public async Task<ActionResult<EntryPopup.Dto>> UploadImage(int slot, IFormFile? file, CancellationToken ct)
    {
        if (slot is < 1 or > EntryPopup.MaxPopups)
            return NotFound();
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

        var popup = await FindOrAddAsync(slot, ct);
        var previous = popup.ImagePublicId;
        popup.ImageUrl = stored.Url;
        popup.ImagePublicId = stored.PublicId;
        await db.SaveChangesAsync(ct);

        if (previous is not null)
            await images.DeleteAsync(previous, ct);
        return EntryPopup.Of(popup);
    }

    [HttpDelete("{slot:int}/image")]
    public async Task<ActionResult<EntryPopup.Dto>> RemoveImage(int slot, CancellationToken ct)
    {
        if (slot is < 1 or > EntryPopup.MaxPopups)
            return NotFound();

        var popup = await FindOrAddAsync(slot, ct);
        var previous = popup.ImagePublicId;
        popup.ImageUrl = null;
        popup.ImagePublicId = null;
        await db.SaveChangesAsync(ct);

        if (previous is not null)
            await images.DeleteAsync(previous, ct);
        return EntryPopup.Of(popup);
    }

    /// <summary>The slot's row; a slot nobody saved yet gets one (turned off) so its picture can be kept.</summary>
    private async Task<PopupSlot> FindOrAddAsync(int slot, CancellationToken ct)
    {
        var popup = await db.PopupSlots.SingleOrDefaultAsync(p => p.Slot == slot, ct);
        if (popup is null)
        {
            popup = new PopupSlot { Slot = slot };
            db.PopupSlots.Add(popup);
        }
        return popup;
    }
}
