using Microsoft.AspNetCore.Mvc;

namespace FoodSite.Api.Controllers.Admin;

/// <summary>
/// The feature guide for the signed-in admin: one self-contained HTML file that the production image builds from
/// <c>docs/</c> (<c>scripts/build-feature-guide.mjs</c>) into <c>guide/feature-guide.html</c> next to the app.
/// Not in wwwroot, so it is not public. <c>Guide:Path</c> overrides the location (tests).
/// </summary>
[Route("api/admin/guide")]
public class GuideController(IConfiguration config) : AdminControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        var path = config["Guide:Path"] ?? Path.Combine(AppContext.BaseDirectory, "guide", "feature-guide.html");
        if (!System.IO.File.Exists(path))
            return NotFound(new { code = "guideUnavailable" });
        // The page is repository content with its own script: run it in a sandbox, apart from the site's cookies and storage, and let it load nothing from the network.
        Response.Headers.ContentSecurityPolicy =
            "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; sandbox allow-scripts allow-modals";
        Response.Headers.CacheControl = "private, no-cache";
        Response.Headers.XContentTypeOptions = "nosniff";
        return PhysicalFile(path, "text/html; charset=utf-8");
    }
}
