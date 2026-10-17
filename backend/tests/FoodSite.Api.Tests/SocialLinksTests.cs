using System.Net;
using System.Net.Http.Json;
using FoodSite.Api.Controllers;
using FoodSite.Api.Social;
using static FoodSite.Api.Controllers.Admin.SocialLinksController;

namespace FoodSite.Api.Tests;

public class SocialLinksUrlTests
{
    [Theory]
    [InlineData("https://www.facebook.com/shop", "https://www.facebook.com/shop")]
    [InlineData("  instagram.com/shop ", "https://instagram.com/shop")]
    public void Addresses_become_https_urls(string typed, string expected) =>
        Assert.Equal(expected, SocialLinks.NormalizeUrl(typed));

    [Theory]
    [InlineData("")]
    [InlineData("http://example.com")]
    [InlineData("javascript:alert(1)")]
    [InlineData("https://user:pw@example.com")]
    [InlineData("https://nodot")]
    [InlineData("two words.com")]
    public void Other_addresses_are_refused(string typed) => Assert.Null(SocialLinks.NormalizeUrl(typed));
}

[Collection(PostgresCollection.Name)]
public sealed class SocialLinksTests(PostgresFixture postgres) : IAsyncLifetime
{
    private readonly ApiFactory _factory = new(postgres);
    private HttpClient _admin = null!;

    public async Task InitializeAsync() => _admin = await _factory.CreateAdminClientAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private Task<HttpResponseMessage> Save(params LinkInput[] links) =>
        _admin.PutAsJsonAsync("/api/admin/social-links", new LinksInput([.. links]), TestFiles.Json);

    [Fact]
    public async Task Links_are_saved_in_a_fixed_order_and_shown_on_the_client_site()
    {
        (await Save(
            new LinkInput("custom", " יוטיוב ", "youtube.com/@shop"),
            new LinkInput("tiktok", null, "https://www.tiktok.com/@shop"),
            new LinkInput("facebook", null, "https://facebook.com/shop"))).EnsureSuccessStatusCode();

        var saved = await _admin.GetAsync("/api/admin/social-links").Read<List<LinkDto>>();
        Assert.Equal(["facebook", "tiktok", "custom"], saved.Select(l => l.Kind));
        Assert.Equal(("יוטיוב", "https://youtube.com/@shop"), (saved[2].Label, saved[2].Url));

        var site = await _factory.CreateApiClient().GetAsync("/api/site").Read<PublicController.SiteDto>();
        Assert.Equal(["facebook", "tiktok", "custom"], site.SocialLinks!.Select(l => l.Kind));

        (await Save(new LinkInput("facebook", null, "https://facebook.com/shop"))).EnsureSuccessStatusCode();
        Assert.Single(await _admin.GetAsync("/api/admin/social-links").Read<List<LinkDto>>());
        (await Save()).EnsureSuccessStatusCode();
        Assert.Empty((await _factory.CreateApiClient().GetAsync("/api/site").Read<PublicController.SiteDto>()).SocialLinks!);
    }

    [Theory]
    [InlineData("facebook", null, "http://facebook.com/shop")]
    [InlineData("instagram", null, "javascript:alert(1)")]
    [InlineData("custom", null, "https://example.com")]
    [InlineData("custom", "x", "")]
    [InlineData("myspace", null, "https://example.com")]
    public async Task Invalid_links_are_refused(string kind, string? label, string url)
    {
        var response = await Save(new LinkInput(kind, label, url));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(await _admin.GetAsync("/api/admin/social-links").Read<List<LinkDto>>());
    }

    [Fact]
    public async Task A_platform_can_be_listed_once()
    {
        var response = await Save(new LinkInput("facebook", null, "https://facebook.com/a"), new LinkInput("facebook", null, "https://facebook.com/b"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Only_the_admin_can_change_the_links()
    {
        var response = await _factory.CreateApiClient().PutAsJsonAsync("/api/admin/social-links", new LinksInput([]), TestFiles.Json);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
