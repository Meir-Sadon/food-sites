using FoodSite.Api.Auth;
using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Orders;
using FoodSite.Api.Phones;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using static FoodSite.Api.Controllers.Admin.Ordering;

namespace FoodSite.Api.Controllers.Admin;

/// <summary>
/// The clients who registered on this site, newest first, with what the admin needs to get in touch. The owner can also
/// register a client who does not use the site, and open the order page as a client to place an order for them.
/// </summary>
[Route("api/admin/clients")]
public class ClientsController(
    AppDbContext db, UserTokenService tokens, IOptions<Auth.CookieOptions> cookie, TimeProvider time) : AdminControllerBase
{
    /// <summary>More than this many clients are cut off (the oldest); the list says so.</summary>
    public const int Limit = 1000;

    public record ClientDto(
        int Id, string FullName, string Phone, string? Email, DateTimeOffset? CreatedAt, int Orders, bool WithGoogle, bool Restricted = false);

    public record ClientsDto(int Total, IReadOnlyList<ClientDto> Clients);

    public record ClientInput(string? FullName, string? Phone, string? Email, string? City, string? Street, string? HouseNumber, string? Apartment);

    [HttpGet]
    public async Task<ClientsDto> Get(CancellationToken ct)
    {
        var total = await db.Users.CountAsync(ct);
        var restricted = (await db.RestrictedClients.AsNoTracking().Select(c => c.Phone).ToListAsync(ct)).ToHashSet();
        var clients = await db.Users.AsNoTracking()
            .OrderByDescending(u => u.CreatedAt).ThenByDescending(u => u.Id)
            .Take(Limit)
            .Select(u => new ClientDto(
                u.Id, u.FullName, u.Phone, u.Email, u.CreatedAt, u.Orders.Count, u.GoogleSub != null))
            .ToListAsync(ct);
        clients = clients.Select(c => c with { Restricted = restricted.Contains(c.Phone) }).ToList();
        return new ClientsDto(total, clients);
    }

    /// <summary>Registers a client for someone who will not order on the site. The name and phone are required; an address is optional.</summary>
    [HttpPost]
    public async Task<ActionResult<ClientDto>> Create(ClientInput input, CancellationToken ct)
    {
        var errors = new Errors();
        errors.Text(nameof(input.FullName), input.FullName, AccountController.NameMaxLength, required: true);
        errors.Text(nameof(input.Email), input.Email, AccountController.EmailMaxLength);
        errors.Text(nameof(input.City), input.City, AddressFormat.PartMaxLength);
        errors.Text(nameof(input.Street), input.Street, AddressFormat.PartMaxLength);
        errors.Text(nameof(input.HouseNumber), input.HouseNumber, AddressFormat.PartMaxLength);
        errors.Text(nameof(input.Apartment), input.Apartment, AddressFormat.PartMaxLength);
        var phone = PhoneNumber.Normalize(input.Phone);
        if (phone is null)
            errors.Add(nameof(input.Phone), "phone");
        if (!string.IsNullOrWhiteSpace(input.Email) && !ContactsController.LooksLikeEmail(input.Email.Trim()))
            errors.Add(nameof(input.Email), "email");
        var hasAddress = new[] { input.City, input.Street, input.HouseNumber }.All(p => !string.IsNullOrWhiteSpace(p));
        if (!hasAddress && new[] { input.City, input.Street, input.HouseNumber, input.Apartment }.Any(p => !string.IsNullOrWhiteSpace(p)))
            errors.Add(nameof(input.Street), "required");
        if (errors.Any)
            return Invalid(errors);
        if (await db.Users.AnyAsync(u => u.Phone == phone, ct))
            return Conflict("clientPhoneTaken");

        var now = time.GetUtcNow();
        var user = new User { Phone = phone!, FullName = input.FullName!.Trim(), Address = "", Email = Clean(input.Email), CreatedAt = now };
        if (hasAddress)
        {
            var composed = AddressFormat.Compose(input.City, input.Street, input.HouseNumber, input.Apartment);
            user.Addresses.Add(new UserAddress
            {
                City = input.City!.Trim(), Street = input.Street!.Trim(), HouseNumber = input.HouseNumber!.Trim(),
                Apartment = input.Apartment?.Trim() ?? "", Address = composed, IsDefault = true, CreatedAt = now,
            });
            user.City = input.City.Trim();
            user.Street = input.Street.Trim();
            user.HouseNumber = input.HouseNumber.Trim();
            user.Apartment = input.Apartment?.Trim() ?? "";
            user.Address = composed;
        }
        db.Users.Add(user);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            return Conflict("clientPhoneTaken");
        }
        return new ClientDto(user.Id, user.FullName, user.Phone, user.Email, user.CreatedAt, 0, false);
    }

    /// <summary>
    /// Opens the client's session in this browser, marked as the owner's: the order page then shows that client's details,
    /// addresses and prices, and an order sent from it is flagged <c>PlacedByOwner</c>. It lasts <see cref="UserTokenService.OwnerSessionLength"/>
    /// or until the owner ends it with the client logout.
    /// </summary>
    [HttpPost("{id:int}/order-session")]
    public async Task<IActionResult> OpenOrderSession(int id, CancellationToken ct)
    {
        if (!await db.Users.AnyAsync(u => u.Id == id, ct))
            return NotFound();
        var (token, expiresAt) = tokens.CreateToken(id, byOwner: true);
        Response.Cookies.Append(cookie.Value.UserName, token, new Microsoft.AspNetCore.Http.CookieOptions
        {
            HttpOnly = true,
            Secure = cookie.Value.Secure,
            SameSite = cookie.Value.SameSite,
            Path = "/api",
            Expires = expiresAt,
        });
        return NoContent();
    }
}
