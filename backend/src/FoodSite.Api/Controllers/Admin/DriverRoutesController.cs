using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Deliveries;
using FoodSite.Api.Orders;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FoodSite.Api.Controllers.Admin;

/// <summary>
/// The links the admin sends a driver from the driver's report: each opens one supply day's chosen deliveries,
/// in the admin's order, and nothing else.
/// </summary>
[Route("api/admin/driver-routes")]
public class DriverRoutesController(AppDbContext db, SiteClock clock, TimeProvider time) : AdminControllerBase
{
    public record StopInput(int OrderId, TimeOnly? PlannedArrival = null);

    public record RouteInput(DateOnly Date, List<StopInput>? Stops);

    /// <summary>A driver link: its stops' order ids in driving order, and how many of them the driver reported.</summary>
    public record DriverRouteDto(
        int Id, string Token, DateOnly Date, DateOnly ValidThrough, DateTimeOffset CreatedAt, IReadOnlyList<int> OrderIds, int Reported);

    /// <summary>The day's links that still work, newest first.</summary>
    [HttpGet]
    public async Task<ActionResult<IEnumerable<DriverRouteDto>>> GetAll(DateOnly date)
    {
        if (!DriverLinks.IsValid(date, clock.NowLocal()))
            return Ok(Array.Empty<DriverRouteDto>());
        var routes = await db.DriverRoutes.AsNoTracking()
            .Where(r => r.SupplyDate == date)
            .Include(r => r.Stops).ThenInclude(s => s.Order)
            .OrderByDescending(r => r.CreatedAt).ThenByDescending(r => r.Id)
            .ToListAsync();
        return Ok(routes.Select(ToDto));
    }

    [HttpPost]
    public async Task<ActionResult<DriverRouteDto>> Create(RouteInput input)
    {
        var stops = input.Stops ?? [];
        var errors = new Errors();
        if (!DriverLinks.IsValid(input.Date, clock.NowLocal()))
            errors.Add(nameof(input.Date), "linkExpired");
        if (stops.Count is 0 or > DriverRoute.MaxStops || stops.Select(s => s.OrderId).Distinct().Count() != stops.Count)
            errors.Add(nameof(input.Stops), "invalid");
        if (errors.Any)
            return Invalid(errors);

        var ids = stops.Select(s => s.OrderId).ToList();
        // Only the day's live deliveries can be on a driver's route.
        var found = await db.Orders.AsNoTracking()
            .Where(o => ids.Contains(o.Id) && o.SupplyDate == input.Date
                && o.FulfillmentMethod == FulfillmentMethod.Delivery && o.Status != OrderStatus.Cancelled)
            .CountAsync();
        if (found != ids.Count)
            return Invalid(nameof(input.Stops), "invalid");

        var route = new DriverRoute
        {
            Token = DriverLinks.NewToken(),
            SupplyDate = input.Date,
            CreatedAt = time.GetUtcNow(),
            Stops = stops.Select((s, i) => new DriverRouteStop { OrderId = s.OrderId, Position = i, PlannedArrival = s.PlannedArrival }).ToList(),
        };
        db.DriverRoutes.Add(route);
        await db.SaveChangesAsync();
        return ToDto(route);
    }

    /// <summary>Stops the link working at once. What the driver already reported stays on the orders.</summary>
    [HttpDelete("{id:int}")]
    public async Task<ActionResult> Delete(int id)
    {
        // Loaded and removed (not ExecuteDelete) so the audit trail records it.
        var route = await db.DriverRoutes.FindAsync(id);
        if (route is null)
            return NotFound();
        db.DriverRoutes.Remove(route);
        await db.SaveChangesAsync();
        return NoContent();
    }

    private static DriverRouteDto ToDto(DriverRoute r)
    {
        var stops = r.Stops.OrderBy(s => s.Position).ToList();
        return new DriverRouteDto(
            r.Id, r.Token, r.SupplyDate, DriverLinks.ValidThrough(r.SupplyDate), r.CreatedAt,
            stops.Select(s => s.OrderId).ToList(),
            stops.Count(s => s.Order?.DeliveryOutcome is not null));
    }
}
