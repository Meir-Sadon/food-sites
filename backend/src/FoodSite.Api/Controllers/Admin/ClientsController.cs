using FoodSite.Api.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FoodSite.Api.Controllers.Admin;

/// <summary>The clients who registered on this site, newest first, with what the admin needs to get in touch. Read-only.</summary>
[Route("api/admin/clients")]
public class ClientsController(AppDbContext db) : AdminControllerBase
{
    /// <summary>More than this many clients are cut off (the oldest); the list says so.</summary>
    public const int Limit = 1000;

    public record ClientDto(
        int Id, string FullName, string Phone, string? Email, DateTimeOffset? CreatedAt, int Orders, bool WithGoogle);

    public record ClientsDto(int Total, IReadOnlyList<ClientDto> Clients);

    [HttpGet]
    public async Task<ClientsDto> Get(CancellationToken ct)
    {
        var total = await db.Users.CountAsync(ct);
        var clients = await db.Users.AsNoTracking()
            .OrderByDescending(u => u.CreatedAt).ThenByDescending(u => u.Id)
            .Take(Limit)
            .Select(u => new ClientDto(
                u.Id, u.FullName, u.Phone, u.Email, u.CreatedAt, u.Orders.Count, u.GoogleSub != null))
            .ToListAsync(ct);
        return new ClientsDto(total, clients);
    }
}
