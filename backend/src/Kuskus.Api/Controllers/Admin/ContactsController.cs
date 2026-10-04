using Kuskus.Api.Data;
using Kuskus.Api.Data.Entities;
using Kuskus.Api.Phones;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using static Kuskus.Api.Controllers.Admin.Ordering;

namespace Kuskus.Api.Controllers.Admin;

/// <summary>The main contact shown on the site, and the phones that get a WhatsApp for every new order.</summary>
[Route("api/admin")]
public class ContactsController(AppDbContext db) : AdminControllerBase
{
    public const int NameMaxLength = 100;
    public const int AddressMaxLength = 300;
    public const int EmailMaxLength = 200;
    public const int OpeningHoursMaxLength = 500;

    public record ContactDto(string? Name, string? Phone, string? Address, string? Email, string? OpeningHours);

    public record NotifyPhoneDto(int Id, string Phone, string? Name);

    public record NotifyPhoneInput(string? Phone, string? Name);

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
            .Select(p => new NotifyPhoneDto(p.Id, p.Phone, p.Name)).ToListAsync();

    [HttpPost("notify-phones")]
    public async Task<ActionResult<NotifyPhoneDto>> AddNotifyPhone(NotifyPhoneInput input)
    {
        var errors = new Errors();
        errors.Text(nameof(input.Name), input.Name, NameMaxLength);
        var phone = PhoneNumber.Normalize(input.Phone);
        if (string.IsNullOrWhiteSpace(input.Phone))
            errors.Add(nameof(input.Phone), "required");
        else if (phone is null)
            errors.Add(nameof(input.Phone), "phone");
        if (errors.Any)
            return Invalid(errors);
        if (await db.NotifyPhones.AnyAsync(p => p.Phone == phone))
            return Invalid(nameof(input.Phone), "duplicate");

        var entity = new NotifyPhone { Phone = phone!, Name = Clean(input.Name) };
        db.NotifyPhones.Add(entity);
        await db.SaveChangesAsync();
        return new NotifyPhoneDto(entity.Id, entity.Phone, entity.Name);
    }

    [HttpDelete("notify-phones/{id:int}")]
    public async Task<IActionResult> RemoveNotifyPhone(int id)
    {
        var deleted = await db.NotifyPhones.Where(p => p.Id == id).ExecuteDeleteAsync();
        return deleted == 0 ? NotFound() : NoContent();
    }

    private static bool LooksLikeEmail(string value)
    {
        var at = value.IndexOf('@');
        return at > 0 && at == value.LastIndexOf('@') && value.IndexOf('.', at) > at + 1
            && !value.EndsWith('.') && !value.Contains(' ');
    }

    private static ContactDto ToDto(Settings s) =>
        new(s.ContactName, s.ContactPhone, s.ContactAddress, s.ContactEmail, s.ContactOpeningHours);
}
