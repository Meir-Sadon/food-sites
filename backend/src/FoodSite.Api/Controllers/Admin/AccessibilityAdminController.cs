using FoodSite.Api.Data;
using FoodSite.Api.Phones;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using static FoodSite.Api.Controllers.Admin.Ordering;

namespace FoodSite.Api.Controllers.Admin;

/// <summary>The accessibility coordinator and known limits shown in the site's accessibility statement (הצהרת נגישות).</summary>
[Route("api/admin/accessibility")]
public class AccessibilityAdminController(AppDbContext db) : AdminControllerBase
{
    public const int NameMaxLength = 100;
    public const int EmailMaxLength = 200;
    public const int NotesMaxLength = 1500;

    public record AccessibilityDto(string? Name, string? Phone, string? Email, string? Notes, DateTimeOffset? UpdatedAt);

    [HttpGet]
    public async Task<AccessibilityDto> Get() => ToDto(await db.Settings.AsNoTracking().SingleAsync());

    [HttpPut]
    public async Task<ActionResult<AccessibilityDto>> Update(AccessibilityDto input)
    {
        var errors = new Errors();
        errors.Text(nameof(input.Name), input.Name, NameMaxLength);
        errors.Text(nameof(input.Email), input.Email, EmailMaxLength);
        errors.Text(nameof(input.Notes), input.Notes, NotesMaxLength);
        if (!string.IsNullOrWhiteSpace(input.Phone) && PhoneNumber.Normalize(input.Phone) is null)
            errors.Add(nameof(input.Phone), "phone");
        if (!string.IsNullOrWhiteSpace(input.Email) && !ContactsController.LooksLikeEmail(input.Email.Trim()))
            errors.Add(nameof(input.Email), "email");
        if (errors.Any)
            return Invalid(errors);

        var settings = await db.Settings.SingleAsync();
        settings.AccessibilityCoordinatorName = Clean(input.Name);
        settings.AccessibilityCoordinatorPhone = Clean(input.Phone);
        settings.AccessibilityCoordinatorEmail = Clean(input.Email);
        settings.AccessibilityNotes = Clean(input.Notes);
        settings.AccessibilityUpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();
        return ToDto(settings);
    }

    internal static AccessibilityDto ToDto(Data.Entities.Settings s) =>
        new(s.AccessibilityCoordinatorName, s.AccessibilityCoordinatorPhone, s.AccessibilityCoordinatorEmail, s.AccessibilityNotes, s.AccessibilityUpdatedAt);
}
