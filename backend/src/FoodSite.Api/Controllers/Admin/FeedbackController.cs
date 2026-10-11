using FoodSite.Api.Auth;
using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FoodSite.Api.Controllers.Admin;

/// <summary>
/// "Report a problem / comment": the admin's reports to the platform, kept in the site's database for the console
/// to collect (ops API), which also marks them handled.
/// </summary>
[Route("api/admin/feedback")]
public class FeedbackController(AppDbContext db, TimeProvider time) : AdminControllerBase
{
    /// <summary>The most reports the admin's list shows, newest first.</summary>
    public const int ListLimit = 100;

    public record FeedbackInput(FeedbackKind? Kind, string? Text, string? Page);

    public record FeedbackDto(int Id, FeedbackKind Kind, string Text, string? Page, string Actor, DateTimeOffset CreatedAt, bool IsHandled);

    [HttpGet]
    public async Task<IReadOnlyList<FeedbackDto>> List() => await db.Feedback.AsNoTracking()
        .OrderByDescending(f => f.CreatedAt).ThenByDescending(f => f.Id)
        .Take(ListLimit)
        .Select(f => new FeedbackDto(f.Id, f.Kind, f.Text, f.Page, f.Actor, f.CreatedAt, f.IsHandled))
        .ToListAsync();

    [HttpPost]
    public async Task<ActionResult<FeedbackDto>> Add(FeedbackInput input)
    {
        var errors = new Errors();
        if (input.Kind is null)
            errors.Add(nameof(input.Kind), "required");
        errors.Text(nameof(input.Text), input.Text, Feedback.TextMaxLength, required: true);
        errors.Text(nameof(input.Page), input.Page, Feedback.PageMaxLength);
        if (errors.Any)
            return Invalid(errors);

        var feedback = new Feedback
        {
            Kind = input.Kind!.Value,
            Text = input.Text!.Trim(),
            Page = Ordering.Clean(input.Page),
            Actor = User.FindFirst(AdminTokenService.ActorClaim)!.Value,
            CreatedAt = time.GetUtcNow(),
        };
        db.Feedback.Add(feedback);
        await db.SaveChangesAsync();
        return new FeedbackDto(feedback.Id, feedback.Kind, feedback.Text, feedback.Page, feedback.Actor, feedback.CreatedAt, feedback.IsHandled);
    }
}
