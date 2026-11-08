using FoodSite.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace FoodSite.Api.Tests;

[Collection(PostgresCollection.Name)]
public sealed class SeoTests(PostgresFixture postgres) : IAsyncLifetime
{
    private readonly string _webRoot = Directory.CreateTempSubdirectory("foodsite-wwwroot").FullName;
    private ApiFactory _factory = null!;

    public async Task InitializeAsync()
    {
        await File.WriteAllTextAsync(Path.Combine(_webRoot, "index.html"),
            "<!doctype html><html><head><title>t</title></head><body><div id=\"root\"></div></body></html>");
        _factory = new ApiFactory(postgres, new() { ["webroot"] = _webRoot });
    }

    public Task DisposeAsync()
    {
        _factory.Dispose();
        Directory.Delete(_webRoot, recursive: true);
        return Task.CompletedTask;
    }

    [Fact]
    public async Task Robots_keep_private_pages_out_and_point_to_the_sitemap()
    {
        var robots = await _factory.CreateApiClient().GetStringAsync("/robots.txt");

        Assert.Contains("Disallow: /admin/", robots);
        Assert.Contains("Disallow: /api/", robots);
        Assert.Contains("Sitemap: http://localhost/sitemap.xml", robots);
    }

    [Fact]
    public async Task The_sitemap_lists_the_public_pages_at_the_public_address()
    {
        using var factory = new ApiFactory(postgres, new() { ["Site:PublicUrl"] = "https://shop.example.co.il/" });

        var sitemap = await factory.CreateApiClient().GetStringAsync("/sitemap.xml");

        Assert.Contains("<loc>https://shop.example.co.il/</loc>", sitemap);
        Assert.Contains("<loc>https://shop.example.co.il/about</loc>", sitemap);
        Assert.Contains("<loc>https://shop.example.co.il/recommendations</loc>", sitemap);
        Assert.DoesNotContain("/admin", sitemap);
    }

    [Fact]
    public async Task Public_pages_carry_a_canonical_address_and_the_business_as_json_ld()
    {
        using (var db = _factory.CreateDbContext())
        {
            var settings = await db.Settings.SingleAsync();
            settings.ContactPhone = "050-1234567";
            settings.ContactAddress = "הרצל 1, אשקלון";
            db.SocialLinks.Add(new SocialLink { Kind = "instagram", Url = "https://instagram.com/shop" });
            await db.SaveChangesAsync();
        }

        var response = await _factory.CreateApiClient().GetAsync("/about");
        var html = await response.Content.ReadAsStringAsync();

        Assert.Equal("text/html", response.Content.Headers.ContentType?.MediaType);
        Assert.Contains("<link rel=\"canonical\" href=\"http://localhost/about\">", html);
        Assert.Contains("application/ld+json", html);
        Assert.Contains("\"telephone\":\"050-1234567\"", html);
        Assert.Contains("https://instagram.com/shop", html);
        Assert.DoesNotContain("noindex", html);
        Assert.True(html.IndexOf("application/ld+json") < html.IndexOf("</head>"));
    }

    [Theory]
    [InlineData("/")]
    [InlineData("/privacy")]
    public async Task The_home_page_and_other_public_pages_load_the_app(string path)
    {
        var html = await _factory.CreateApiClient().GetStringAsync(path);

        Assert.Contains("<div id=\"root\">", html);
        Assert.Contains("rel=\"canonical\"", html);
    }

    [Theory]
    [InlineData("/admin/orders")]
    [InlineData("/d/some-token")]
    [InlineData("/profile")]
    public async Task Private_pages_are_noindex_without_business_details(string path)
    {
        var html = await _factory.CreateApiClient().GetStringAsync(path);

        Assert.Contains("<meta name=\"robots\" content=\"noindex\">", html);
        Assert.DoesNotContain("ld+json", html);
    }

    [Fact]
    public async Task Api_paths_and_files_are_not_the_app()
    {
        var client = _factory.CreateApiClient();

        Assert.Equal(System.Net.HttpStatusCode.NotFound, (await client.GetAsync("/api/nothing")).StatusCode);
        Assert.Equal(System.Net.HttpStatusCode.NotFound, (await client.GetAsync("/missing.js")).StatusCode);
    }
}
