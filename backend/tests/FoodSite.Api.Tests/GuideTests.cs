using System.Net;

namespace FoodSite.Api.Tests;

[Collection(PostgresCollection.Name)]
public sealed class GuideTests(PostgresFixture postgres) : IAsyncLifetime
{
    private readonly string _file = Path.Combine(Path.GetTempPath(), $"guide-{Guid.NewGuid():N}.html");

    public Task InitializeAsync() => File.WriteAllTextAsync(_file, "<!doctype html><title>guide</title>");

    public Task DisposeAsync()
    {
        File.Delete(_file);
        return Task.CompletedTask;
    }

    [Fact]
    public async Task The_guide_is_served_to_the_admin_only_and_in_a_sandbox()
    {
        using var factory = new ApiFactory(postgres, new() { ["Guide:Path"] = _file });

        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateApiClient().GetAsync("/api/admin/guide")).StatusCode);

        var response = await (await factory.CreateAdminClientAsync()).GetAsync("/api/admin/guide");
        response.EnsureSuccessStatusCode();
        Assert.Equal("text/html", response.Content.Headers.ContentType?.MediaType);
        Assert.Contains("<title>guide</title>", await response.Content.ReadAsStringAsync());
        Assert.Contains("sandbox", response.Headers.GetValues("Content-Security-Policy").Single());
    }

    [Fact]
    public async Task A_missing_guide_is_a_404_with_a_code()
    {
        using var factory = new ApiFactory(postgres, new() { ["Guide:Path"] = _file + ".missing" });
        var response = await (await factory.CreateAdminClientAsync()).GetAsync("/api/admin/guide");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Contains("guideUnavailable", await response.Content.ReadAsStringAsync());
    }
}
