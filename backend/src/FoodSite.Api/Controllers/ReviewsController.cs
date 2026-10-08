using FoodSite.Api.Controllers.Admin;
using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Images;
using FoodSite.Api.Sites;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using static FoodSite.Api.Controllers.Admin.Ordering;

namespace FoodSite.Api.Controllers;

/// <summary>
/// The approved reviews on the home page, and the review page a client reaches from the link the admin sent:
/// up to two pictures (uploaded one at a time), then the stars, comment and name, sent once.
/// </summary>
[Route("api/reviews")]
[RequireFeature(Features.Reviews)]
public class ReviewsController(AppDbContext db, IImageStore images, IOptions<SiteOptions> site, TimeProvider time) : PublicControllerBase
{
    /// <summary>How many approved reviews the home page shows, newest first.</summary>
    public const int ShownLimit = 30;

    public record ReviewDto(int Id, string? Name, int Rating, string? Comment, IReadOnlyList<string> Images, DateTimeOffset SubmittedAt);

    public record ReviewImageDto(int Id, string Url);

    /// <summary>What the review page needs: the name it starts with, whether it was sent, and the pictures added so far.</summary>
    public record ReviewFormDto(string? Name, bool Submitted, IReadOnlyList<ReviewImageDto> Images);

    public record SubmitInput(int Rating, string? Comment, string? Name);

    [HttpGet]
    public async Task<IReadOnlyList<ReviewDto>> Approved()
    {
        var reviews = await db.Reviews.AsNoTracking()
            .Where(r => r.Status == ReviewStatus.Approved && r.SubmittedAt != null)
            .OrderByDescending(r => r.SubmittedAt).ThenByDescending(r => r.Id)
            .Take(ShownLimit)
            .Include(r => r.Images)
            .ToListAsync();
        return reviews.Select(r => new ReviewDto(
            r.Id, r.Name, r.Rating ?? 0, r.Comment,
            r.Images.OrderBy(i => i.DisplayOrder).Select(i => i.Url).ToList(), r.SubmittedAt!.Value)).ToList();
    }

    [HttpGet("{token}")]
    public async Task<ActionResult<ReviewFormDto>> Get(string token) =>
        await FindAsync(token) is { } review ? ToForm(review) : NotFound();

    [HttpPost("{token}/images")]
    [EnableRateLimiting(WriteRateLimitPolicy)]
    [RequestSizeLimit(ImageUploadRules.MaxRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = ImageUploadRules.MaxRequestBytes)]
    public async Task<ActionResult<ReviewFormDto>> AddImage(string token, IFormFile? file, CancellationToken ct)
    {
        var review = await FindAsync(token, ct);
        if (review is null)
            return NotFound();
        if (review.SubmittedAt is not null)
            return Conflict("reviewAlreadySent");
        if (review.Images.Count >= Review.MaxImages)
            return Invalid("file", "tooManyImages");
        if (ImageUploadRules.Validate(file) is { } code)
            return Invalid("file", code);

        StoredImage stored;
        try
        {
            await using var stream = file!.OpenReadStream();
            stored = await images.UploadAsync(stream, file.FileName, site.Value.ImageFolder("reviews"), ct);
        }
        catch (ImageStoreUnavailableException)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { code = "imageStoreUnavailable" });
        }

        var order = review.Images.Count == 0 ? 0 : review.Images.Max(i => i.DisplayOrder) + 1;
        review.Images.Add(new ReviewImage { Url = stored.Url, PublicId = stored.PublicId, DisplayOrder = order });
        await db.SaveChangesAsync(ct);
        return ToForm(review);
    }

    [HttpDelete("{token}/images/{imageId:int}")]
    [EnableRateLimiting(WriteRateLimitPolicy)]
    public async Task<ActionResult<ReviewFormDto>> RemoveImage(string token, int imageId, CancellationToken ct)
    {
        var review = await FindAsync(token, ct);
        var image = review?.Images.SingleOrDefault(i => i.Id == imageId);
        if (review is null || image is null)
            return NotFound();
        if (review.SubmittedAt is not null)
            return Conflict("reviewAlreadySent");

        review.Images.Remove(image);
        db.ReviewImages.Remove(image);
        await db.SaveChangesAsync(ct);
        await images.DeleteAsync(image.PublicId, ct);
        return ToForm(review);
    }

    /// <summary>Sends the review. It waits for the admin's approval before the home page shows it.</summary>
    [HttpPost("{token}")]
    [EnableRateLimiting(WriteRateLimitPolicy)]
    public async Task<ActionResult> Submit(string token, SubmitInput input, CancellationToken ct)
    {
        var review = await FindAsync(token, ct);
        if (review is null)
            return NotFound();
        if (review.SubmittedAt is not null)
            return Conflict("reviewAlreadySent");

        var errors = new Errors();
        if (input.Rating is < 1 or > 5)
            errors.Add(nameof(input.Rating), "ratingRequired");
        errors.Text(nameof(input.Comment), input.Comment, Review.CommentMaxLength);
        errors.Text(nameof(input.Name), input.Name, Review.NameMaxLength);
        if (errors.Any)
            return Invalid(errors);

        var comment = Clean(input.Comment);
        var name = Clean(input.Name);
        var now = time.GetUtcNow();
        // Only the first of two sends at once counts.
        var saved = await db.Reviews.Where(r => r.Id == review.Id && r.SubmittedAt == null)
            .ExecuteUpdateAsync(s => s
                .SetProperty(r => r.Rating, input.Rating)
                .SetProperty(r => r.Comment, comment)
                .SetProperty(r => r.Name, name)
                .SetProperty(r => r.Status, ReviewStatus.Pending)
                .SetProperty(r => r.SubmittedAt, now), ct);
        return saved == 0 ? Conflict("reviewAlreadySent") : NoContent();
    }

    private Task<Review?> FindAsync(string token, CancellationToken ct = default) =>
        token.Length != Review.TokenLength
            ? Task.FromResult<Review?>(null)
            : db.Reviews.Include(r => r.Images).SingleOrDefaultAsync(r => r.Token == token, ct);

    private static ReviewFormDto ToForm(Review r) => new(
        r.Name, r.SubmittedAt is not null,
        r.Images.OrderBy(i => i.DisplayOrder).Select(i => new ReviewImageDto(i.Id, i.Url)).ToList());
}
