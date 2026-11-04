using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Phones;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FoodSite.Api.Controllers.Admin;

/// <summary>
/// Clients the admin marked as restricted, and the WhatsApp message asking them to pay in advance. Admin-only:
/// nothing here reaches the public API, the order page or any mail to the client.
/// </summary>
[Route("api/admin/restricted-clients")]
public class RestrictedClientsController(AppDbContext db) : AdminControllerBase
{
    public const int MessageMaxLength = 1000;

    public record RestrictedDto(string? Message, IReadOnlyList<string> Phones);

    public record PhoneInput(string? Phone);

    public record MessageInput(string? Message);

    [HttpGet]
    public async Task<RestrictedDto> Get() => await ToDtoAsync();

    [HttpPost]
    public async Task<ActionResult<RestrictedDto>> Add(PhoneInput input)
    {
        var phone = PhoneNumber.Normalize(input.Phone);
        if (phone is null)
            return Invalid(nameof(input.Phone), "phone");
        if (!await db.RestrictedClients.AnyAsync(c => c.Phone == phone))
        {
            db.RestrictedClients.Add(new RestrictedClient { Phone = phone });
            await db.SaveChangesAsync();
        }
        return await ToDtoAsync();
    }

    [HttpDelete("{phone}")]
    public async Task<ActionResult<RestrictedDto>> Remove(string phone)
    {
        var normalized = PhoneNumber.Normalize(phone);
        // Loaded rather than deleted in place, so the removal reaches the audit trail.
        var found = await db.RestrictedClients.Where(c => c.Phone == normalized).ToListAsync();
        db.RestrictedClients.RemoveRange(found);
        await db.SaveChangesAsync();
        return await ToDtoAsync();
    }

    [HttpPut("message")]
    public async Task<ActionResult<RestrictedDto>> SetMessage(MessageInput input)
    {
        var errors = new Errors();
        errors.Text(nameof(input.Message), input.Message, MessageMaxLength);
        if (errors.Any)
            return Invalid(errors);
        var settings = await db.Settings.SingleAsync();
        settings.RestrictedClientMessage = string.IsNullOrWhiteSpace(input.Message) ? null : input.Message.Trim();
        await db.SaveChangesAsync();
        return await ToDtoAsync();
    }

    private async Task<RestrictedDto> ToDtoAsync() => new(
        await db.Settings.AsNoTracking().Select(s => s.RestrictedClientMessage).SingleAsync(),
        await db.RestrictedClients.AsNoTracking().OrderBy(c => c.Id).Select(c => c.Phone).ToListAsync());
}
