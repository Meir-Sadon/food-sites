using FoodSite.Api.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace FoodSite.Api.Sites;

/// <summary>Which <see cref="Features"/> are on: the site's own database first, then its <c>site.json</c>.</summary>
public class FeatureFlags(AppDbContext db, IOptions<SiteOptions> site)
{
    public async Task<IReadOnlyList<string>> EnabledAsync(CancellationToken ct = default)
    {
        var overrides = await db.FeatureFlags.AsNoTracking().ToDictionaryAsync(f => f.Name, f => f.IsEnabled, ct);
        return Features.All
            .Where(name => overrides.TryGetValue(name, out var enabled) ? enabled : site.Value.IsEnabledByDefault(name))
            .ToList();
    }

    public async Task<bool> IsEnabledAsync(string name, CancellationToken ct = default)
    {
        var enabled = await db.FeatureFlags.AsNoTracking()
            .Where(f => f.Name == name).Select(f => (bool?)f.IsEnabled).SingleOrDefaultAsync(ct);
        return enabled ?? site.Value.IsEnabledByDefault(name);
    }
}

/// <summary>Answers 404 <c>{ code: "featureDisabled" }</c> while the feature is off for this site.</summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class RequireFeatureAttribute(string name) : Attribute, IAsyncActionFilter
{
    public string Name => name;

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var flags = context.HttpContext.RequestServices.GetRequiredService<FeatureFlags>();
        if (!await flags.IsEnabledAsync(name, context.HttpContext.RequestAborted))
        {
            context.Result = new NotFoundObjectResult(new { code = "featureDisabled" });
            return;
        }
        await next();
    }
}
