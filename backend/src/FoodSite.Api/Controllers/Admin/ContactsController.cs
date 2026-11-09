using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Phones;
using FoodSite.Api.Push;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using static FoodSite.Api.Controllers.Admin.Ordering;

namespace FoodSite.Api.Controllers.Admin;

/// <summary>The main contact shown on the site, and the phones that get a WhatsApp for every new order.</summary>
[Route("api/admin")]
public partial class ContactsController(
    AppDbContext db, IPushSender push, IOptions<PushoverOptions> pushover, ILogger<ContactsController> logger) : AdminControllerBase
{
    public const int NameMaxLength = 100;
    public const int AddressMaxLength = 300;
    public const int EmailMaxLength = 200;
    public const int OpeningHoursMaxLength = 500;

    public record ContactDto(string? Name, string? Phone, string? Address, string? Email, string? OpeningHours);

    public record NotifyPhoneDto(int Id, string Phone, string? Name, string? PushoverKey = null, string? PushoverSound = null);

    public record NotifyPhoneInput(string? Phone, string? Name, string? PushoverKey = null, string? PushoverSound = null);

    [HttpGet("contact")]
    public async Task<ContactDto> GetContact() => ToDto(await db.Settings.AsNoTracking().SingleAsync());

    [HttpPut("contact")]
    public async Task<ActionResult<ContactDto>> UpdateContact(ContactDto input)
    {
        var errors = new Errors();
        errors.Text(nameof(input.Name), input.Name, NameMaxLength, required: true);
        errors.Text(nameof(input.Address), input.Address, AddressMaxLength);
        errors.Text(nameof(input.Email), input.Email, EmailMaxLength);
        errors.Text(nameof(input.OpeningHours), input.OpeningHours, OpeningHoursMaxLength);
        if (string.IsNullOrWhiteSpace(input.Phone))
            errors.Add(nameof(input.Phone), "required");
        else if (PhoneNumber.Normalize(input.Phone) is null)
            errors.Add(nameof(input.Phone), "phone");
        if (!string.IsNullOrWhiteSpace(input.Email) && !LooksLikeEmail(input.Email.Trim()))
            errors.Add(nameof(input.Email), "email");
        if (errors.Any)
            return Invalid(errors);

        var settings = await db.Settings.SingleAsync();
        settings.ContactName = Clean(input.Name);
        settings.ContactPhone = Clean(input.Phone);
        settings.ContactAddress = Clean(input.Address);
        settings.ContactEmail = Clean(input.Email);
        settings.ContactOpeningHours = Clean(input.OpeningHours);
        await db.SaveChangesAsync();
        return ToDto(settings);
    }

    [HttpGet("notify-phones")]
    public async Task<IEnumerable<NotifyPhoneDto>> GetNotifyPhones() =>
        await db.NotifyPhones.AsNoTracking().OrderBy(p => p.Id)
            .Select(p => new NotifyPhoneDto(p.Id, p.Phone, p.Name, p.PushoverKey, p.PushoverSound)).ToListAsync();

    [HttpPost("notify-phones")]
    public async Task<ActionResult<NotifyPhoneDto>> AddNotifyPhone(NotifyPhoneInput input)
    {
        var (phone, key, sound, errors) = Validate(input);
        if (errors.Any)
            return Invalid(errors);
        if (await db.NotifyPhones.AnyAsync(p => p.Phone == phone))
            return Invalid(nameof(input.Phone), "duplicate");

        var entity = new NotifyPhone { Phone = phone!, Name = Clean(input.Name), PushoverKey = key, PushoverSound = key is null ? null : sound };
        db.NotifyPhones.Add(entity);
        await db.SaveChangesAsync();
        return ToDto(entity);
    }

    /// <summary>Edits a number in place: its name, Pushover key (blank turns the phone alert off) and sound.</summary>
    [HttpPut("notify-phones/{id:int}")]
    public async Task<ActionResult<NotifyPhoneDto>> UpdateNotifyPhone(int id, NotifyPhoneInput input)
    {
        var entity = await db.NotifyPhones.FindAsync(id);
        if (entity is null)
            return NotFound();
        var (phone, key, sound, errors) = Validate(input);
        if (errors.Any)
            return Invalid(errors);
        if (await db.NotifyPhones.AnyAsync(p => p.Phone == phone && p.Id != id))
            return Invalid(nameof(input.Phone), "duplicate");

        entity.Phone = phone!;
        entity.Name = Clean(input.Name);
        entity.PushoverKey = key;
        entity.PushoverSound = key is null ? null : sound;
        await db.SaveChangesAsync();
        return ToDto(entity);
    }

    private static NotifyPhoneDto ToDto(NotifyPhone p) => new(p.Id, p.Phone, p.Name, p.PushoverKey, p.PushoverSound);

    private static (string? Phone, string? Key, string? Sound, Errors Errors) Validate(NotifyPhoneInput input)
    {
        var errors = new Errors();
        errors.Text(nameof(input.Name), input.Name, NameMaxLength);
        var phone = PhoneNumber.Normalize(input.Phone);
        if (string.IsNullOrWhiteSpace(input.Phone))
            errors.Add(nameof(input.Phone), "required");
        else if (phone is null)
            errors.Add(nameof(input.Phone), "phone");
        var key = Clean(input.PushoverKey);
        if (key is not null && !PushoverKeyPattern().IsMatch(key))
            errors.Add(nameof(input.PushoverKey), "pushoverKey");
        var sound = Clean(input.PushoverSound);
        if (sound is not null && !PushoverSounds.IsKnown(sound))
            errors.Add(nameof(input.PushoverSound), "invalid");
        return (phone, key, sound, errors);
    }

    /// <summary>Sends one alert to the phone, with its own sound, so the admin can hear what a new order will do.</summary>
    [HttpPost("notify-phones/{id:int}/test")]
    public async Task<IActionResult> TestNotifyPhone(int id, CancellationToken ct)
    {
        var phone = await db.NotifyPhones.AsNoTracking().SingleOrDefaultAsync(p => p.Id == id, ct);
        if (phone is null)
            return NotFound();
        if (!pushover.Value.IsConfigured)
            return Invalid(nameof(NotifyPhoneInput.PushoverKey), "pushoverNotConfigured");
        if (string.IsNullOrWhiteSpace(phone.PushoverKey))
            return Invalid(nameof(NotifyPhoneInput.PushoverKey), "required");
        try
        {
            await push.SendAsync(phone.PushoverKey, phone.PushoverSound, "התראת ניסיון", "כך תישמע התראה על הזמנה חדשה.", null, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Pushover test alert to {Phone} failed", phone.Phone);
            return Invalid(nameof(NotifyPhoneInput.PushoverKey), "pushoverFailed");
        }
        return NoContent();
    }

    [HttpDelete("notify-phones/{id:int}")]
    public async Task<IActionResult> RemoveNotifyPhone(int id)
    {
        // Loaded rather than deleted in place, so the removal reaches the audit trail.
        var phone = await db.NotifyPhones.FindAsync(id);
        if (phone is null)
            return NotFound();
        db.NotifyPhones.Remove(phone);
        await db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>A Pushover user key: 30 letters and digits.</summary>
    [System.Text.RegularExpressions.GeneratedRegex("^[A-Za-z0-9]{30}$")]
    private static partial System.Text.RegularExpressions.Regex PushoverKeyPattern();

    internal static bool LooksLikeEmail(string value)
    {
        var at = value.IndexOf('@');
        return at > 0 && at == value.LastIndexOf('@') && value.IndexOf('.', at) > at + 1
            && !value.EndsWith('.') && !value.Contains(' ');
    }

    private static ContactDto ToDto(Settings s) =>
        new(s.ContactName, s.ContactPhone, s.ContactAddress, s.ContactEmail, s.ContactOpeningHours);
}
