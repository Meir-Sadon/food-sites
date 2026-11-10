using FoodSite.Api.Banners;
using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Images;
using FoodSite.Api.Sites;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using static FoodSite.Api.Controllers.Admin.Ordering;

namespace FoodSite.Api.Controllers.Admin;

/// <summary>
/// The order page's top banner (own logo, colours, texts and ovals, or the standard banner) and the scroll animation
/// under it. The text and choices are saved together; the logo and each animation picture on their own.
/// </summary>
[Route("api/admin/banner")]
[RequireFeature(Features.BannerAnimation)]
public class BannerController(AppDbContext db, IImageStore images, IOptions<SiteOptions> site) : AdminControllerBase
{
    public record BannerInput(
        bool Enabled, string? Title, string? Tagline, IReadOnlyList<string>? Chips, string? Background, string? TextColor,
        bool AnimationEnabled, int? AnimationScreens);

    [HttpGet]
    public async Task<OrderBannerRules.Dto> Get(CancellationToken ct) => await CurrentAsync(ct);

    [HttpPut]
    public async Task<ActionResult<OrderBannerRules.Dto>> Update(BannerInput input, CancellationToken ct)
    {
        var errors = new Errors();
        errors.Text(nameof(input.Title), input.Title, OrderBannerRules.TitleMaxLength);
        errors.Text(nameof(input.Tagline), input.Tagline, OrderBannerRules.TaglineMaxLength);

        var chips = (input.Chips ?? []).Select(Clean).OfType<string>().ToList();
        if (chips.Count > OrderBannerRules.MaxChips)
            errors.Add(nameof(input.Chips), "tooManyChips");
        else if (chips.Any(c => c.Length > OrderBannerRules.ChipMaxLength || c.Contains('\n')))
            errors.Add(nameof(input.Chips), "tooLong");

        var background = Clean(input.Background);
        if (background is not null && !Palettes.IsColor(background))
            errors.Add(nameof(input.Background), "invalid");
        var textColor = Clean(input.TextColor);
        if (textColor is not null && !Palettes.IsColor(textColor))
            errors.Add(nameof(input.TextColor), "invalid");
        if (input.AnimationScreens is < OrderBannerRules.MinScreens or > OrderBannerRules.MaxScreens)
            errors.Add(nameof(input.AnimationScreens), "invalid");
        if (input.AnimationEnabled && await db.BannerFrames.CountAsync(ct) < 2)
            errors.Add(nameof(input.AnimationEnabled), "framesMissing");
        if (errors.Any)
            return Invalid(errors);

        var banner = await FindOrAddAsync(ct);
        banner.Enabled = input.Enabled;
        banner.Title = Clean(input.Title);
        banner.Tagline = Clean(input.Tagline);
        banner.Chips = chips.Count == 0 ? null : string.Join('\n', chips);
        banner.Background = background?.ToLowerInvariant();
        banner.TextColor = textColor?.ToLowerInvariant();
        banner.AnimationEnabled = input.AnimationEnabled;
        banner.AnimationScreens = input.AnimationScreens;
        await db.SaveChangesAsync(ct);
        return await CurrentAsync(ct);
    }

    [HttpPut("logo")]
    [RequestSizeLimit(ImageUploadRules.MaxRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = ImageUploadRules.MaxRequestBytes)]
    public async Task<ActionResult<OrderBannerRules.Dto>> UploadLogo(IFormFile? file, CancellationToken ct)
    {
        var stored = await StoreAsync(file, "banner", ct);
        if (stored.Failure is { } failure)
            return failure;

        var banner = await FindOrAddAsync(ct);
        var previous = banner.LogoPublicId;
        banner.LogoUrl = stored.Image!.Url;
        banner.LogoPublicId = stored.Image.PublicId;
        await db.SaveChangesAsync(ct);

        if (previous is not null)
            await images.DeleteAsync(previous, ct);
        return await CurrentAsync(ct);
    }

    [HttpDelete("logo")]
    public async Task<ActionResult<OrderBannerRules.Dto>> RemoveLogo(CancellationToken ct)
    {
        var banner = await FindOrAddAsync(ct);
        var previous = banner.LogoPublicId;
        banner.LogoUrl = null;
        banner.LogoPublicId = null;
        await db.SaveChangesAsync(ct);

        if (previous is not null)
            await images.DeleteAsync(previous, ct);
        return await CurrentAsync(ct);
    }

    [HttpPost("frames")]
    [RequestSizeLimit(ImageUploadRules.MaxRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = ImageUploadRules.MaxRequestBytes)]
    public async Task<ActionResult<OrderBannerRules.Dto>> AddFrame(IFormFile? file, CancellationToken ct)
    {
        var frames = await db.BannerFrames.OrderBy(f => f.DisplayOrder).ThenBy(f => f.Id).ToListAsync(ct);
        if (frames.Count >= OrderBannerRules.MaxFrames)
            return Invalid("file", "tooManyFrames");

        var stored = await StoreAsync(file, "banner-frames", ct);
        if (stored.Failure is { } failure)
            return failure;

        db.BannerFrames.Add(new BannerFrame
        {
            DisplayOrder = frames.Count,
            ImageUrl = stored.Image!.Url,
            ImagePublicId = stored.Image.PublicId,
        });
        await db.SaveChangesAsync(ct);
        return await CurrentAsync(ct);
    }

    [HttpDelete("frames/{id:int}")]
    public async Task<ActionResult<OrderBannerRules.Dto>> RemoveFrame(int id, CancellationToken ct)
    {
        var frames = await db.BannerFrames.OrderBy(f => f.DisplayOrder).ThenBy(f => f.Id).ToListAsync(ct);
        var frame = frames.SingleOrDefault(f => f.Id == id);
        if (frame is null)
            return NotFound();

        frames.Remove(frame);
        db.BannerFrames.Remove(frame);
        Renumber(frames, (f, i) => f.DisplayOrder = i);
        // An animation needs two pictures at least.
        var banner = await db.OrderBanners.FirstOrDefaultAsync(ct);
        if (banner is { AnimationEnabled: true } && frames.Count < 2)
            banner.AnimationEnabled = false;
        await db.SaveChangesAsync(ct);

        await images.DeleteAsync(frame.ImagePublicId, ct);
        return await CurrentAsync(ct);
    }

    [HttpPost("frames/{id:int}/move")]
    public async Task<ActionResult<OrderBannerRules.Dto>> MoveFrame(int id, MoveRequest request, CancellationToken ct)
    {
        var frames = await db.BannerFrames.OrderBy(f => f.DisplayOrder).ThenBy(f => f.Id).ToListAsync(ct);
        var frame = frames.SingleOrDefault(f => f.Id == id);
        if (frame is null)
            return NotFound();

        if (Move(frames, frame, request.Direction, (f, i) => f.DisplayOrder = i))
            await db.SaveChangesAsync(ct);
        return await CurrentAsync(ct);
    }

    private record Stored(StoredImage? Image, ActionResult? Failure);

    private async Task<Stored> StoreAsync(IFormFile? file, string kind, CancellationToken ct)
    {
        if (ImageUploadRules.Validate(file) is { } code)
            return new Stored(null, Invalid("file", code));
        try
        {
            await using var stream = file!.OpenReadStream();
            return new Stored(await images.UploadAsync(stream, file.FileName, site.Value.ImageFolder(kind), ct), null);
        }
        catch (ImageStoreUnavailableException e)
        {
            return new Stored(null, ImageStoreUnavailable(e));
        }
    }

    private async Task<OrderBannerRules.Dto> CurrentAsync(CancellationToken ct) =>
        OrderBannerRules.Of(await db.OrderBanners.AsNoTracking().FirstOrDefaultAsync(ct), await db.BannerFrames.AsNoTracking().ToListAsync(ct));

    private async Task<OrderBanner> FindOrAddAsync(CancellationToken ct)
    {
        var banner = await db.OrderBanners.FirstOrDefaultAsync(ct);
        if (banner is null)
        {
            banner = new OrderBanner();
            db.OrderBanners.Add(banner);
        }
        return banner;
    }
}
