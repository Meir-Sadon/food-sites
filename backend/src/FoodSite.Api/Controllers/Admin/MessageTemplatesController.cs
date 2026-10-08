using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FoodSite.Api.Controllers.Admin;

/// <summary>The admin's WhatsApp message templates, sent by hand to a client from the Orders tab.</summary>
[Route("api/admin/message-templates")]
public class MessageTemplatesController(AppDbContext db) : AdminControllerBase
{
    public record TemplateDto(int Id, string Name, string Text, bool IncludeReviewLink);

    public record TemplateInput(string? Name, string? Text, bool IncludeReviewLink);

    [HttpGet]
    public async Task<IReadOnlyList<TemplateDto>> GetAll() =>
        await db.MessageTemplates.AsNoTracking().OrderBy(t => t.Id)
            .Select(t => new TemplateDto(t.Id, t.Name, t.Text, t.IncludeReviewLink))
            .ToListAsync();

    [HttpPost]
    public async Task<ActionResult<TemplateDto>> Create(TemplateInput input)
    {
        if (Validate(input) is { } invalid)
            return invalid;
        var template = new MessageTemplate { Name = input.Name!.Trim(), Text = input.Text!.Trim(), IncludeReviewLink = input.IncludeReviewLink };
        db.MessageTemplates.Add(template);
        await db.SaveChangesAsync();
        return ToDto(template);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<TemplateDto>> Update(int id, TemplateInput input)
    {
        var template = await db.MessageTemplates.FindAsync(id);
        if (template is null)
            return NotFound();
        if (Validate(input) is { } invalid)
            return invalid;
        template.Name = input.Name!.Trim();
        template.Text = input.Text!.Trim();
        template.IncludeReviewLink = input.IncludeReviewLink;
        await db.SaveChangesAsync();
        return ToDto(template);
    }

    [HttpDelete("{id:int}")]
    public async Task<ActionResult> Delete(int id)
    {
        var deleted = await db.MessageTemplates.Where(t => t.Id == id).ExecuteDeleteAsync();
        return deleted == 0 ? NotFound() : NoContent();
    }

    private ActionResult? Validate(TemplateInput input)
    {
        var errors = new Errors();
        errors.Text(nameof(input.Name), input.Name, MessageTemplate.NameMaxLength, required: true);
        errors.Text(nameof(input.Text), input.Text, MessageTemplate.TextMaxLength, required: true);
        return errors.Any ? Invalid(errors) : null;
    }

    private static TemplateDto ToDto(MessageTemplate t) => new(t.Id, t.Name, t.Text, t.IncludeReviewLink);
}
