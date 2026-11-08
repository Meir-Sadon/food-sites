using System.Net;
using System.Text;
using System.Text.Json;
using FoodSite.Api.Data;
using FoodSite.Api.Orders;
using FoodSite.Api.Sites;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace FoodSite.Api.Seo;

/// <summary>
/// What search engines read on the server's pages: <c>robots.txt</c>, <c>sitemap.xml</c>, and the tags added to
/// index.html (canonical address, link preview picture, <c>noindex</c> on private pages, and the business as
/// schema.org JSON-LD from the admin's contact settings). The site's name and tagline are put in index.html when
/// it is built (frontend <c>vite.config.ts</c>). Addresses use <see cref="SiteOptions.PublicUrl"/> when set, else the request's.
/// </summary>
public class SeoHead(AppDbContext db, FeatureFlags features, IOptions<SiteOptions> site, IWebHostEnvironment env)
{
    /// <summary>Client pages worth listing; <c>/recommendations</c> only while its feature is on.</summary>
    private static readonly string[] PublicPaths = ["/", "/about", "/accessibility", "/privacy"];

    /// <summary>Pages that are personal, behind a sign-in, or reached by a private link.</summary>
    private static readonly string[] PrivatePrefixes = ["/admin", "/d", "/r", "/login", "/profile"];

    /// <summary>index.html as built, read once (by path, since each test server has its own web root).</summary>
    private static (string Path, string Html)? _index;

    public static bool IsPrivate(string path) =>
        PrivatePrefixes.Any(p => path.Equals(p, StringComparison.OrdinalIgnoreCase)
            || path.StartsWith(p + "/", StringComparison.OrdinalIgnoreCase));

    public string BaseUrl(HttpRequest request) =>
        string.IsNullOrWhiteSpace(site.Value.PublicUrl)
            ? $"{request.Scheme}://{request.Host}"
            : site.Value.PublicUrl.Trim().TrimEnd('/');

    public string RobotsTxt(HttpRequest request)
    {
        var text = new StringBuilder("User-agent: *\n");
        foreach (var prefix in PrivatePrefixes)
            text.Append($"Disallow: {prefix}/\n");
        text.Append("Disallow: /api/\n");
        text.Append($"\nSitemap: {BaseUrl(request)}/sitemap.xml\n");
        return text.ToString();
    }

    public async Task<string> SitemapXml(HttpRequest request)
    {
        var paths = PublicPaths.ToList();
        if (await features.IsEnabledAsync(Features.Recommendations))
            paths.Add("/recommendations");
        var baseUrl = BaseUrl(request);
        var xml = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        xml.Append("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");
        foreach (var path in paths)
            xml.Append($"  <url><loc>{WebUtility.HtmlEncode(baseUrl + (path == "/" ? "/" : path))}</loc></url>\n");
        xml.Append("</urlset>\n");
        return xml.ToString();
    }

    /// <summary>The built index.html with this page's tags added before <c>&lt;/head&gt;</c>.</summary>
    public async Task<string> IndexHtml(HttpRequest request)
    {
        var file = Path.Combine(env.WebRootPath, "index.html");
        if (_index?.Path != file)
            _index = (file, await File.ReadAllTextAsync(file));
        var html = _index.Value.Html;
        var path = request.Path.Value is { Length: > 1 } p ? p.TrimEnd('/') : "/";
        var tags = IsPrivate(path) ? "<meta name=\"robots\" content=\"noindex\">\n" : await PublicTags(request, path);
        var head = html.IndexOf("</head>", StringComparison.OrdinalIgnoreCase);
        return head < 0 ? html : html.Insert(head, tags);
    }

    private async Task<string> PublicTags(HttpRequest request, string path)
    {
        var baseUrl = BaseUrl(request);
        var url = baseUrl + path;
        var s = await db.Settings.AsNoTracking().SingleAsync();
        var social = await db.SocialLinks.AsNoTracking().OrderBy(l => l.DisplayOrder).ThenBy(l => l.Id)
            .Select(l => l.Url).ToListAsync();
        var image = string.IsNullOrWhiteSpace(s.BackgroundImageUrl) ? $"{baseUrl}/icon-512.png" : s.BackgroundImageUrl;

        var business = new Dictionary<string, object>
        {
            ["@context"] = "https://schema.org",
            ["@type"] = "FoodEstablishment",
            ["name"] = site.Value.Name ?? "",
            ["url"] = baseUrl + "/",
            ["image"] = image,
        };
        if (!string.IsNullOrWhiteSpace(s.ContactPhone))
            business["telephone"] = s.ContactPhone.Trim();
        if (!string.IsNullOrWhiteSpace(s.ContactAddress))
            business["address"] = new Dictionary<string, string>
            {
                ["@type"] = "PostalAddress",
                ["streetAddress"] = s.ContactAddress.Trim(),
                ["addressCountry"] = "IL",
            };
        if (ServiceArea.Parse(s.ServiceCities) is { Count: > 0 } cities)
            business["areaServed"] = cities;
        if (social.Count > 0)
            business["sameAs"] = social;

        // The default encoder escapes <, > and &, so the JSON cannot close the script tag.
        var jsonLd = JsonSerializer.Serialize(business);
        var attr = (string value) => WebUtility.HtmlEncode(value);
        return $"<link rel=\"canonical\" href=\"{attr(url)}\">\n"
            + $"<meta property=\"og:url\" content=\"{attr(url)}\">\n"
            + $"<meta property=\"og:image\" content=\"{attr(image)}\">\n"
            + $"<script type=\"application/ld+json\">{jsonLd}</script>\n";
    }
}
