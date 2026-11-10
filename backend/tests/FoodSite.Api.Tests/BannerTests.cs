using System.Net;
using System.Net.Http.Json;
using FoodSite.Api.Banners;
using FoodSite.Api.Controllers;
using FoodSite.Api.Controllers.Admin;
using static FoodSite.Api.Controllers.Admin.BannerController;

namespace FoodSite.Api.Tests;

public class OrderBannerRulesTests
{
    [Fact]
    public void Chips_are_one_per_line() => Assert.Equal(["טרי", "ביתי"], OrderBannerRules.ParseChips(" טרי\n\nביתי "));

    [Theory]
    [InlineData(null, 4)]
    [InlineData(1, 4)]
    [InlineData(11, 4)]
    [InlineData(6, 6)]
    public void Screens_fall_back_to_the_default(int? saved, int expected) => Assert.Equal(expected, OrderBannerRules.EffectiveScreens(saved));
}

[Collection(PostgresCollection.Name)]
public sealed class BannerTests(PostgresFixture postgres) : IAsyncLifetime
{
    private readonly ApiFactory _factory = new(postgres, new() { ["Site:Features:bannerAnimation"] = "true" });
    private HttpClient _admin = null!;

    public async Task InitializeAsync() => _admin = await _factory.CreateAdminClientAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private static BannerInput Input(bool enabled = true, bool animation = false, string? title = "ברוכים הבאים", string? background = "#112233") =>
        new(enabled, title, "משפט", ["טרי", "ביתי"], background, "#ffffff", animation, 3);

    private Task<HttpResponseMessage> Save(BannerInput input) => _admin.PutAsJsonAsync("/api/admin/banner", input, TestFiles.Json);

    private async Task<OrderBannerRules.Dto?> ClientBanner() =>
        (await _factory.CreateApiClient().GetAsync("/api/site").Read<PublicController.SiteDto>()).Banner;

    private async Task AddFrames(int count)
    {
        for (var i = 0; i < count; i++)
            Assert.Equal(HttpStatusCode.OK, (await _admin.PostAsync("/api/admin/banner/frames", TestFiles.Upload(TestFiles.Jpeg))).StatusCode);
    }

    [Fact]
    public async Task Without_a_banner_clients_get_nothing()
    {
        Assert.Null(await ClientBanner());
        var admin = await _admin.GetAsync("/api/admin/banner").Read<OrderBannerRules.Dto>();
        Assert.False(admin.Enabled);
        Assert.Empty(admin.Frames);
    }

    [Fact]
    public async Task A_saved_banner_reaches_clients()
    {
        var saved = await (await Save(Input())).Read<OrderBannerRules.Dto>();
        Assert.Equal(["טרי", "ביתי"], saved.Chips);

        var shown = (await ClientBanner())!;
        Assert.Equal("ברוכים הבאים", shown.Title);
        Assert.Equal("#112233", shown.Background);
        Assert.Equal(3, shown.AnimationScreens);
        Assert.False(shown.AnimationEnabled);
    }

    [Fact]
    public async Task A_switched_off_banner_without_animation_is_not_sent()
    {
        await Save(Input(enabled: false));
        Assert.Null(await ClientBanner());
    }

    [Theory]
    [InlineData("red")]
    [InlineData("#12345")]
    public async Task A_bad_colour_is_refused(string colour)
    {
        var response = await Save(Input(background: colour));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Too_long_a_title_and_too_many_ovals_are_refused()
    {
        Assert.Equal(HttpStatusCode.BadRequest, (await Save(Input(title: new string('א', 61)))).StatusCode);
        var many = Input() with { Chips = ["1", "2", "3", "4", "5", "6", "7"] };
        Assert.Equal(HttpStatusCode.BadRequest, (await Save(many)).StatusCode);
    }

    [Fact]
    public async Task The_animation_needs_two_pictures()
    {
        Assert.Equal(HttpStatusCode.BadRequest, (await Save(Input(animation: true))).StatusCode);

        await AddFrames(2);
        var saved = await (await Save(Input(animation: true))).Read<OrderBannerRules.Dto>();
        Assert.True(saved.AnimationEnabled);

        var shown = (await ClientBanner())!;
        Assert.True(shown.AnimationEnabled);
        Assert.Equal(2, shown.Frames.Count);

        // Removing a picture so that only one is left turns the animation off.
        var left = await (await _admin.DeleteAsync($"/api/admin/banner/frames/{saved.Frames[0].Id}")).Read<OrderBannerRules.Dto>();
        Assert.False(left.AnimationEnabled);
        Assert.Single(left.Frames);
        Assert.Single(_factory.Images.Deleted);
    }

    [Fact]
    public async Task Pictures_can_be_reordered()
    {
        await AddFrames(3);
        var frames = (await _admin.GetAsync("/api/admin/banner").Read<OrderBannerRules.Dto>()).Frames;

        var moved = await (await _admin.PostAsJsonAsync($"/api/admin/banner/frames/{frames[2].Id}/move", new MoveRequest(MoveDirection.Up), TestFiles.Json))
            .Read<OrderBannerRules.Dto>();
        Assert.Equal([frames[0].Id, frames[2].Id, frames[1].Id], moved.Frames.Select(f => f.Id));
    }

    [Fact]
    public async Task The_logo_is_replaced_and_removed()
    {
        var first = await (await _admin.PutAsync("/api/admin/banner/logo", TestFiles.Upload(TestFiles.Jpeg))).Read<OrderBannerRules.Dto>();
        Assert.StartsWith($"https://images.test/{ApiFactory.SiteId}/banner/", first.LogoUrl);

        var second = await (await _admin.PutAsync("/api/admin/banner/logo", TestFiles.Upload(TestFiles.Png, "l.png", "image/png"))).Read<OrderBannerRules.Dto>();
        Assert.NotEqual(first.LogoUrl, second.LogoUrl);
        Assert.Single(_factory.Images.Deleted);

        var removed = await (await _admin.DeleteAsync("/api/admin/banner/logo")).Read<OrderBannerRules.Dto>();
        Assert.Null(removed.LogoUrl);
        Assert.Equal(2, _factory.Images.Deleted.Count);
    }

    [Fact]
    public async Task A_file_that_is_not_a_picture_is_refused()
    {
        var response = await _admin.PutAsync("/api/admin/banner/logo", TestFiles.Upload("<svg/>"u8.ToArray(), "x.jpg", "image/jpeg"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task The_feature_off_hides_the_banner_and_its_admin()
    {
        await Save(Input());
        using var off = new ApiFactory(postgres);
        var admin = await off.CreateAdminClientAsync();
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync("/api/admin/banner")).StatusCode);
    }
}
