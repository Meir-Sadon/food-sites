using Kuskus.Api.Data;
using Kuskus.Api.Data.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Kuskus.Api.Controllers.Admin;

[Route("api/admin/categories")]
public class CategoriesController(AppDbContext db) : AdminControllerBase
{
    public const int NameMaxLength = 60;

    /// <summary>DishCount counts dishes on the site, not removed ones.</summary>
    public record CategoryDto(int Id, string Name, int DisplayOrder, int DishCount);

    public record CategoryInput(string? Name);

    [HttpGet]
    public async Task<IEnumerable<CategoryDto>> Get() =>
        await db.Categories
            .Where(c => !c.IsHidden)
            .OrderBy(c => c.DisplayOrder).ThenBy(c => c.Id)
            .Select(c => new CategoryDto(c.Id, c.Name, c.DisplayOrder, c.Dishes.Count(d => !d.IsHidden)))
            .ToListAsync();

    [HttpPost]
    public async Task<ActionResult<CategoryDto>> Add(CategoryInput input)
    {
        if (await ValidateName(input.Name, null) is { } invalid)
            return invalid;

        var last = await db.Categories.Where(c => !c.IsHidden).MaxAsync(c => (int?)c.DisplayOrder) ?? -1;
        var category = new Category { Name = input.Name!.Trim(), DisplayOrder = last + 1 };
        db.Categories.Add(category);
        await db.SaveChangesAsync();
        return new CategoryDto(category.Id, category.Name, category.DisplayOrder, 0);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult> Rename(int id, CategoryInput input)
    {
        var category = await db.Categories.SingleOrDefaultAsync(c => c.Id == id && !c.IsHidden);
        if (category is null)
            return NotFound();
        if (await ValidateName(input.Name, id) is { } invalid)
            return invalid;

        category.Name = input.Name!.Trim();
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("{id:int}/move")]
    public async Task<ActionResult<IEnumerable<CategoryDto>>> Move(int id, MoveRequest request)
    {
        var ordered = await db.Categories.Where(c => !c.IsHidden)
            .OrderBy(c => c.DisplayOrder).ThenBy(c => c.Id).ToListAsync();
        var category = ordered.SingleOrDefault(c => c.Id == id);
        if (category is null)
            return NotFound();

        if (Ordering.Move(ordered, category, request.Direction, (c, i) => c.DisplayOrder = i))
            await db.SaveChangesAsync();
        return Ok(await Get());
    }

    /// <summary>
    /// Refused while the category has dishes on the site. A category that only holds removed
    /// dishes is hidden, so their old orders still display; an empty one is deleted.
    /// </summary>
    [HttpDelete("{id:int}")]
    public async Task<ActionResult> Remove(int id)
    {
        var category = await db.Categories.Include(c => c.Dishes).SingleOrDefaultAsync(c => c.Id == id && !c.IsHidden);
        if (category is null)
            return NotFound();
        if (category.Dishes.Any(d => !d.IsHidden))
            return Conflict("categoryNotEmpty");

        if (category.Dishes.Count == 0)
            db.Categories.Remove(category);
        else
            category.IsHidden = true;
        await db.SaveChangesAsync();
        return NoContent();
    }

    private async Task<ActionResult?> ValidateName(string? name, int? exceptId)
    {
        var errors = new Errors();
        errors.Text("name", name, NameMaxLength, required: true);
        if (errors.Any)
            return Invalid(errors);

        var trimmed = name!.Trim();
        var taken = await db.Categories.AnyAsync(c => !c.IsHidden && c.Name == trimmed && c.Id != exceptId);
        return taken ? Invalid("name", "duplicate") : null;
    }
}
