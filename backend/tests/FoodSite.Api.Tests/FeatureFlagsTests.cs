using System.Net;
using System.Net.Http.Json;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Sites;
using static FoodSite.Api.Controllers.PublicController;

namespace FoodSite.Api.Tests;

[Collection(PostgresCollection.Name)]
public sealed class FeatureFlagsTests(PostgresFixture postgres)
{
    /// <summary>A factory whose site.json turns favorites off and leaves recommendations on.</summary>
    private ApiFactory FavoritesOff() => new(postgres, new() { ["Site:Features:favorites"] = "false" });

    private static async Task<HttpClient> RegisterAsync(ApiFactory factory)
    {
        var guest = factory.CreateApiClient();
        var response = await guest.PostAsJsonAsync("/api/account/register", new
        {
            phone = "0501234567", fullName = "דנה", city = "חיפה", street = "הרצל", houseNumber = "1",
        }, TestFiles.Json);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        var cookie = response.Headers.GetValues("Set-Cookie").Single(c => c.StartsWith(ApiFactory.SiteId + "_user=")).Split(';')[0];
        var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Add("Cookie", cookie);
        return client;
    }

    private static async Task<IReadOnlyList<string>> EnabledAsync(ApiFactory factory) =>
        (await factory.CreateApiClient().GetAsync("/api/site").Read<SiteDto>()).Features;

    [Fact]
    public async Task The_site_lists_the_features_its_site_json_turns_on()
    {
        await using var factory = FavoritesOff();
        Assert.Equal([Features.Recommendations, Features.Reviews], await EnabledAsync(factory));
    }

    [Fact]
    public async Task A_feature_the_site_does_not_list_is_off()
    {
        await using var factory = new ApiFactory(postgres, new()
        {
            ["Site:Features:recommendations"] = null,
            ["Site:Features:favorites"] = null,
            ["Site:Features:reviews"] = null,
        });
        Assert.Empty(await EnabledAsync(factory));
    }

    [Fact]
    public async Task A_disabled_feature_answers_404_on_the_endpoints_it_guards()
    {
        await using var factory = FavoritesOff();
        var client = await RegisterAsync(factory);

        foreach (var response in new[]
        {
            await client.GetAsync("/api/account/favorites"),
            await client.PostAsJsonAsync("/api/account/favorites", new { name = "שישי", orderId = 1 }),
            await client.DeleteAsync("/api/account/favorites/1"),
        })
        {
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            Assert.Contains("featureDisabled", await response.Content.ReadAsStringAsync());
        }
        // Recommendations are still on.
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/account/recommendations")).StatusCode);
    }

    [Fact]
    public async Task A_row_in_the_database_overrides_site_json_both_ways()
    {
        await using var factory = FavoritesOff();
        using (var db = factory.CreateDbContext())
        {
            db.FeatureFlags.AddRange(
                new FeatureFlag { Name = Features.Favorites, IsEnabled = true },
                new FeatureFlag { Name = Features.Recommendations, IsEnabled = false });
            await db.SaveChangesAsync();
        }

        Assert.Equal([Features.Favorites, Features.Reviews], await EnabledAsync(factory));
        var client = await RegisterAsync(factory);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/account/favorites")).StatusCode);
        var recommendation = await client.PostAsJsonAsync("/api/account/recommendations", new { text = "טעים" });
        Assert.Equal(HttpStatusCode.NotFound, recommendation.StatusCode);
    }

    [Fact]
    public async Task An_unknown_feature_name_stops_the_app()
    {
        await using var factory = new ApiFactory(postgres, new() { ["Site:Features:favourites"] = "true" });
        var error = Assert.Throws<InvalidOperationException>(() => factory.CreateClient());
        Assert.Contains("favourites", error.Message);
    }
}
