using FoodSite.Api.Data;
using FoodSite.Api.Phones;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using static FoodSite.Api.Controllers.Admin.Ordering;
using Settings = FoodSite.Api.Data.Entities.Settings;

namespace FoodSite.Api.Controllers.Admin;

/// <summary>
/// Emergency mode: the site takes no orders and every visitor is told to phone instead. Turning it on needs a phone
/// (the main contact's by default); the message is the admin's, or the default text when left empty.
/// </summary>
[Route("api/admin/emergency")]
public class EmergencyController(AppDbContext db) : AdminControllerBase
{
    public const int MessageMaxLength = 500;

    /// <summary>Phone and Message are what was saved (null: the default); EffectivePhone is the number clients are told to call.</summary>
    public record EmergencyAdminDto(bool Enabled, string? Phone, string? Message, string? EffectivePhone);

    public record EmergencyInput(bool Enabled, string? Phone, string? Message);

    /// <summary>What a client sees: null unless emergency mode is on and there is a number to call.</summary>
    public static PublicController.EmergencyDto? ForClient(Settings s) =>
        s.EmergencyEnabled && EffectivePhone(s) is { } phone ? new PublicController.EmergencyDto(phone, s.EmergencyMessage) : null;

    private static string? EffectivePhone(Settings s) => s.EmergencyPhone ?? s.ContactPhone;

    private static EmergencyAdminDto ToDto(Settings s) => new(s.EmergencyEnabled, s.EmergencyPhone, s.EmergencyMessage, EffectivePhone(s));

    [HttpGet]
    public async Task<EmergencyAdminDto> Get() => ToDto(await db.Settings.AsNoTracking().SingleAsync());

    [HttpPut]
    public async Task<ActionResult<EmergencyAdminDto>> Update(EmergencyInput input)
    {
        var errors = new Errors();
        errors.Text(nameof(input.Message), input.Message, MessageMaxLength);
        var settings = await db.Settings.SingleAsync();
        var phone = Clean(input.Phone);
        if (phone is not null && PhoneNumber.Normalize(phone) is null)
            errors.Add(nameof(input.Phone), "phone");
        if (input.Enabled && phone is null && string.IsNullOrWhiteSpace(settings.ContactPhone))
            errors.Add(nameof(input.Phone), "required");
        if (errors.Any)
            return Invalid(errors);

        settings.EmergencyEnabled = input.Enabled;
        settings.EmergencyPhone = phone;
        settings.EmergencyMessage = Clean(input.Message);
        await db.SaveChangesAsync();
        return ToDto(settings);
    }
}
