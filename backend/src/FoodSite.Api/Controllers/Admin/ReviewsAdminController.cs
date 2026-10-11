using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Reviews;
using FoodSite.Api.Sites;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FoodSite.Api.Controllers.Admin;

/// <summary>Review links for orders, and the submitted reviews the admin approves for the home page or blocks.</summary>
[Route("api/admin/reviews")]
[RequireFeature(Features.Reviews)]
public class ReviewsAdminController(AppDbContext db, TimeProvider time) : AdminControllerBase
{
    public record ReviewImageDto(int Id, string Url);

    public record AdminReviewDto(
        int Id,
        int OrderId,
        string OrderName,
        string Phone,
        string? Name,
        int Rating,
        string? Comment,
        IReadOnlyList<ReviewImageDto> Images,
        ReviewStatus Status,
        DateTimeOffset SubmittedAt);

    public record ReviewLinkDto(string Token, bool Submitted);

    public record StatusInput(ReviewStatus Status);

    /// <summary>Submitted reviews, newest first; optionally only those with one status.</summary>
    [HttpGet]
    public async Task<IReadOnlyList<AdminReviewDto>> GetAll(ReviewStatus? status)
    {
        var query = db.Reviews.AsNoTracking().Where(r => r.SubmittedAt != null);
        if (status is { } s)
            query = query.Where(r => r.Status == s);
        var reviews = await query
            .Include(r => r.Order).Include(r => r.Images)
            .OrderByDescending(r => r.SubmittedAt).ThenByDescending(r => r.Id)
            .ToListAsync();
        return reviews.Select(r => new AdminReviewDto(
            r.Id, r.OrderId, r.Order!.Name, r.Order.Phone, r.Name, r.Rating ?? 0, r.Comment,
            r.Images.OrderBy(i => i.DisplayOrder).Select(i => new ReviewImageDto(i.Id, i.Url)).ToList(),
            r.Status, r.SubmittedAt!.Value)).ToList();
    }

    [HttpPut("{id:int}/status")]
    public async Task<ActionResult> SetStatus(int id, StatusInput input)
    {
        if (!Enum.IsDefined(input.Status))
            return Invalid(nameof(input.Status), "invalid");
        // Loaded rather than updated in place, so the change reaches the audit trail.
        var review = await db.Reviews.SingleOrDefaultAsync(r => r.Id == id && r.SubmittedAt != null);
        if (review is null)
            return NotFound();
        review.Status = input.Status;
        await db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>The order's review link token, made the first time it is asked for. Sending it again gives the same link.</summary>
    [HttpPost("for-order/{orderId:int}")]
    public async Task<ActionResult<ReviewLinkDto>> LinkForOrder(int orderId)
    {
        var existing = await db.Reviews.AsNoTracking().Where(r => r.OrderId == orderId)
            .Select(r => new ReviewLinkDto(r.Token, r.SubmittedAt != null)).SingleOrDefaultAsync();
        if (existing is not null)
            return existing;

        var order = await db.Orders.AsNoTracking().Where(o => o.Id == orderId).Select(o => new { o.Name }).SingleOrDefaultAsync();
        if (order is null)
            return NotFound();

        var review = new Review
        {
            OrderId = orderId, Token = ReviewTokens.New(), Name = ReviewTokens.FirstName(order.Name), CreatedAt = time.GetUtcNow(),
        };
        db.Reviews.Add(review);
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // Two sends at once: the other one made the link.
            db.ChangeTracker.Clear();
            return await db.Reviews.AsNoTracking().Where(r => r.OrderId == orderId)
                .Select(r => new ReviewLinkDto(r.Token, r.SubmittedAt != null)).SingleAsync();
        }
        return new ReviewLinkDto(review.Token, false);
    }
}
