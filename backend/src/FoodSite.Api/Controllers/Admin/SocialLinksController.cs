using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Social;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using static FoodSite.Api.Controllers.Admin.Ordering;

namespace FoodSite.Api.Controllers.Admin;

/// <summary>The links shown on the About page, saved together: the list sent replaces the list stored.</summary>
[Route("api/admin/social-links")]
public class SocialLinksController(AppDbContext db) : AdminControllerBase
{
    public record LinkDto(int Id, string Kind, string? Label, string Url);

    public record LinkInput(string? Kind, string? Label, string? Url);

    public record LinksInput(List<LinkInput>? Links);

    [HttpGet]
    public async Task<IReadOnlyList<LinkDto>> Get() =>
        (await db.SocialLinks.AsNoTracking().OrderBy(l => l.DisplayOrder).ThenBy(l => l.Id).ToListAsync())
            .Select(l => new LinkDto(l.Id, l.Kind, l.Label, l.Url)).ToList();

    [HttpPut]
    public async Task<ActionResult<IReadOnlyList<LinkDto>>> Replace(LinksInput input)
    {
        var links = input.Links ?? [];
        var errors = new Errors();
        if (links.Count(l => l.Kind == SocialLinks.Custom) > SocialLinks.MaxCustom)
            errors.Add("links", "tooManyLinks");
        var urls = new List<string?>();
        for (var i = 0; i < links.Count; i++)
        {
            var link = links[i];
            if (!SocialLinks.IsKnown(link.Kind))
                errors.Add($"links[{i}].kind", "invalid");
            else if (link.Kind != SocialLinks.Custom && links.Take(i).Any(l => l.Kind == link.Kind))
                errors.Add($"links[{i}].kind", "duplicate");
            if (link.Kind == SocialLinks.Custom)
                errors.Text($"links[{i}].label", link.Label, SocialLink.LabelMaxLength, required: true);
            var url = SocialLinks.NormalizeUrl(link.Url);
            if (url is null)
                errors.Add($"links[{i}].url", "link");
            else if (url.Length > SocialLink.UrlMaxLength)
                errors.Add($"links[{i}].url", "tooLong");
            urls.Add(url);
        }
        if (errors.Any)
            return Invalid(errors);

        // Known platforms first (in their fixed order), then the custom links as the admin ordered them.
        var ordered = links.Select((l, i) => (Link: l, Url: urls[i]!))
            .OrderBy(x => x.Link.Kind == SocialLinks.Custom ? SocialLinks.Platforms.Count : SocialLinks.Platforms.ToList().IndexOf(x.Link.Kind!))
            .ToList();
        var existing = await db.SocialLinks.OrderBy(l => l.Id).ToListAsync();
        var reusable = new Queue<SocialLink>(existing);
        for (var i = 0; i < ordered.Count; i++)
        {
            var (link, url) = ordered[i];
            // A row is reused for the next link, so a change reaches the audit trail as an edit, not as a removal and an addition.
            if (!reusable.TryDequeue(out var row))
                db.SocialLinks.Add(row = new SocialLink { Kind = "", Url = "" });
            row.Kind = link.Kind!;
            row.Label = link.Kind == SocialLinks.Custom ? link.Label!.Trim() : null;
            row.Url = url;
            row.DisplayOrder = i;
        }
        db.SocialLinks.RemoveRange(reusable);
        await db.SaveChangesAsync();
        return (await Get()).ToList();
    }
}
