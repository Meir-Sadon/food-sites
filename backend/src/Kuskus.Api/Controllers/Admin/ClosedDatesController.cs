using Kuskus.Api.Data;
using Kuskus.Api.Data.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using static Kuskus.Api.Controllers.Admin.Ordering;

namespace Kuskus.Api.Controllers.Admin;

[Route("api/admin/closed-dates")]
public class ClosedDatesController(AppDbContext db) : AdminControllerBase
{
    public const int ReasonMaxLength = 200;

    public record ClosedDateDto(int Id, DateOnly Date, string? Reason);

    public record ClosedDateInput(DateOnly Date, string? Reason);

    [HttpGet]
    public async Task<IEnumerable<ClosedDateDto>> Get() =>
        await db.ClosedDates.OrderBy(c => c.Date).Select(c => new ClosedDateDto(c.Id, c.Date, c.Reason)).ToListAsync();

    [HttpPost]
    public async Task<ActionResult<ClosedDateDto>> Add(ClosedDateInput input)
    {
        var errors = new Errors();
        if (input.Date == default) errors.Add(nameof(input.Date), "required");
        errors.Text(nameof(input.Reason), input.Reason, ReasonMaxLength);
        if (errors.Any)
            return Invalid(errors);
        if (await db.ClosedDates.AnyAsync(c => c.Date == input.Date))
            return Invalid(nameof(input.Date), "duplicate");

        var closed = new ClosedDate { Date = input.Date, Reason = Clean(input.Reason) };
        db.ClosedDates.Add(closed);
        await db.SaveChangesAsync();
        return new ClosedDateDto(closed.Id, closed.Date, closed.Reason);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Remove(int id)
    {
        var deleted = await db.ClosedDates.Where(c => c.Id == id).ExecuteDeleteAsync();
        return deleted == 0 ? NotFound() : NoContent();
    }
}
