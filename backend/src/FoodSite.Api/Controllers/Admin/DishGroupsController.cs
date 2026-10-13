using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FoodSite.Api.Controllers.Admin;

/// <summary>
/// Custom groups of dishes ("מומלצות", "מנות במבצע"...): each is its own section at the top of the order page and holds
/// any dishes from any categories; a dish can be in several groups.
/// </summary>
[Route("api/admin/dish-groups")]
public class DishGroupsController(AppDbContext db) : AdminControllerBase
{
    public record DishGroupDto(int Id, string Name, int DisplayOrder, IReadOnlyList<int> DishIds);

    /// <summary>DishIds are dishes a client can order on their own (not variants or add-on-only dishes).</summary>
    public record DishGroupInput(string? Name, List<int>? DishIds);

    [HttpGet]
    public async Task<IEnumerable<DishGroupDto>> Get()
    {
        var groups = await db.DishGroups.AsNoTracking().Include(g => g.Dishes)
            .OrderBy(g => g.DisplayOrder).ThenBy(g => g.Id).ToListAsync();
        var listed = await ListedDishIdsAsync();
        return groups.Select(g => ToDto(g, listed)).ToList();
    }

    [HttpPost]
    public async Task<ActionResult<DishGroupDto>> Add(DishGroupInput input)
    {
        if (await Validate(input, null) is { } invalid)
            return invalid;

        var last = await db.DishGroups.MaxAsync(g => (int?)g.DisplayOrder) ?? -1;
        var group = new DishGroup { Name = input.Name!.Trim(), DisplayOrder = last + 1 };
        group.Dishes = (input.DishIds ?? []).Distinct().Select(id => new DishGroupDish { DishId = id }).ToList();
        db.DishGroups.Add(group);
        await db.SaveChangesAsync();
        return ToDto(group, group.Dishes.Select(d => d.DishId).ToHashSet());
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<DishGroupDto>> Update(int id, DishGroupInput input)
    {
        var group = await db.DishGroups.Include(g => g.Dishes).SingleOrDefaultAsync(g => g.Id == id);
        if (group is null)
            return NotFound();
        if (await Validate(input, id) is { } invalid)
            return invalid;

        group.Name = input.Name!.Trim();
        var wanted = (input.DishIds ?? []).ToHashSet();
        foreach (var gone in group.Dishes.Where(d => !wanted.Contains(d.DishId)).ToList())
            group.Dishes.Remove(gone);
        foreach (var dishId in wanted.Where(w => group.Dishes.All(d => d.DishId != w)))
            group.Dishes.Add(new DishGroupDish { DishId = dishId });
        await db.SaveChangesAsync();
        return ToDto(group, wanted);
    }

    [HttpPost("{id:int}/move")]
    public async Task<ActionResult<IEnumerable<DishGroupDto>>> Move(int id, MoveRequest request)
    {
        var ordered = await db.DishGroups.OrderBy(g => g.DisplayOrder).ThenBy(g => g.Id).ToListAsync();
        var group = ordered.SingleOrDefault(g => g.Id == id);
        if (group is null)
            return NotFound();

        if (Ordering.Move(ordered, group, request.Direction, (g, i) => g.DisplayOrder = i))
            await db.SaveChangesAsync();
        return Ok(await Get());
    }

    [HttpDelete("{id:int}")]
    public async Task<ActionResult> Remove(int id)
    {
        var group = await db.DishGroups.SingleOrDefaultAsync(g => g.Id == id);
        if (group is null)
            return NotFound();

        db.DishGroups.Remove(group);
        await db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>The dishes that can be in a group: on the site, ordered on their own.</summary>
    private async Task<HashSet<int>> ListedDishIdsAsync() =>
        (await db.Dishes.AsNoTracking()
            .Where(d => !d.IsHidden && !d.IsAddOnOnly && d.MainDishId == null)
            .Select(d => d.Id).ToListAsync()).ToHashSet();

    private static DishGroupDto ToDto(DishGroup group, HashSet<int> listed) =>
        new(group.Id, group.Name, group.DisplayOrder, group.Dishes.Select(d => d.DishId).Where(listed.Contains).Order().ToList());

    private async Task<ActionResult?> Validate(DishGroupInput input, int? exceptId)
    {
        var errors = new Errors();
        errors.Text("name", input.Name, DishGroup.NameMaxLength, required: true);
        if (input.DishIds is { } ids && ids.Except(await ListedDishIdsAsync()).Any())
            errors.Add("dishIds", "dishNotGroupable");
        if (errors.Any)
            return Invalid(errors);

        var trimmed = input.Name!.Trim();
        var taken = await db.DishGroups.AnyAsync(g => g.Name == trimmed && g.Id != exceptId);
        return taken ? Invalid("name", "duplicate") : null;
    }
}
