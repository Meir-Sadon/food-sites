using System.Text.Json;
using FoodSite.Api.Audit;
using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FoodSite.Api.Controllers.Admin;

/// <summary>
/// The audit trail: who (master or owner) changed what and when. Read-only for both admins; entries are written by
/// <see cref="AppDbContext"/> and never edited or removed.
/// </summary>
[Route("api/admin/audit")]
public class AuditController(AppDbContext db) : AdminControllerBase
{
    public const int DefaultPageSize = 50;
    public const int MaxPageSize = 200;

    public record AuditEntryDto(
        long Id,
        DateTimeOffset At,
        string Actor,
        AuditAction Action,
        string? EntityType,
        string? EntityId,
        string? Label,
        List<AuditChange> Changes);

    /// <summary>Newest first. Pass the last id seen as <paramref name="before"/> for the next page.</summary>
    [HttpGet]
    public async Task<List<AuditEntryDto>> List(long? before = null, int limit = DefaultPageSize)
    {
        limit = Math.Clamp(limit, 1, MaxPageSize);
        var query = db.AuditEntries.AsNoTracking();
        if (before is { } id)
            query = query.Where(a => a.Id < id);
        var entries = await query.OrderByDescending(a => a.Id).Take(limit).ToListAsync();
        return entries.Select(a => new AuditEntryDto(
            a.Id, a.At, a.Actor, a.Action, a.EntityType, a.EntityId, a.Label,
            a.Changes is null ? [] : JsonSerializer.Deserialize<List<AuditChange>>(a.Changes, JsonSerializerOptions.Web) ?? []))
            .ToList();
    }
}
