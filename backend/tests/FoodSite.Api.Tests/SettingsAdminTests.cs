using System.Net;
using System.Net.Http.Json;
using FoodSite.Api.Controllers.Admin;
using FoodSite.Api.Sites;
using Microsoft.EntityFrameworkCore;
using static FoodSite.Api.Controllers.Admin.ClosedDatesController;
using static FoodSite.Api.Controllers.Admin.SettingsController;
using static FoodSite.Api.Controllers.Admin.SupplyDaysController;

namespace FoodSite.Api.Tests;

[Collection(PostgresCollection.Name)]
public sealed class SettingsAdminTests(PostgresFixture postgres) : IAsyncLifetime
{
    private readonly ApiFactory _factory = new(postgres);
    private HttpClient _admin = null!;

    public async Task InitializeAsync() => _admin = await _factory.CreateAdminClientAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private static object Input(bool delivery = true, bool pickup = true, string? phone = "050-1234567", string? kashrut = "כשר", decimal? minimum = 80m, string? cities = "אשקלון") =>
        new { deliveryEnabled = delivery, pickupEnabled = pickup, deliveryAreaText = "  חיפה והקריות ", deliveryFeeText = "", kashrutText = kashrut, paymentPhone = phone, minimumOrderAmount = minimum, serviceCities = cities };

    [Fact]
    public async Task Service_cities_start_from_the_site_and_are_saved_as_a_clean_list()
    {
        Assert.Equal(ApiFactory.ServiceCity, (await _admin.GetAsync("/api/admin/settings").Read<SettingsDto>()).ServiceCities);

        var saved = await (await _admin.PutAsJsonAsync("/api/admin/settings", Input(cities: " אשקלון ,אשדוד,, אשדוד ,שדרות"))).Read<SettingsDto>();
        Assert.Equal("אשקלון, אשדוד, שדרות", saved.ServiceCities);
        var site = await _factory.CreateApiClient().GetAsync("/api/site").Read<Controllers.PublicController.SiteDto>();
        Assert.Equal(["אשקלון", "אשדוד", "שדרות"], site.ServiceCities);

        // Left out by an older client: unchanged. Emptied: every city is served, and a restart doesn't re-seed it.
        Assert.Equal("אשקלון, אשדוד, שדרות", (await (await _admin.PutAsJsonAsync("/api/admin/settings", Input(cities: null))).Read<SettingsDto>()).ServiceCities);
        Assert.Equal("", (await (await _admin.PutAsJsonAsync("/api/admin/settings", Input(cities: " , "))).Read<SettingsDto>()).ServiceCities);
        await using var db = _factory.CreateDbContext();
        await Data.DatabaseInitializer.SeedServiceCitiesAsync(db, ApiFactory.ServiceCity, Microsoft.Extensions.Logging.Abstractions.NullLogger.Instance);
        Assert.Equal("", (await _admin.GetAsync("/api/admin/settings").Read<SettingsDto>()).ServiceCities);
    }

    [Fact]
    public async Task The_site_settings_fill_empty_fields_once()
    {
        var logger = Microsoft.Extensions.Logging.Abstractions.NullLogger.Instance;
        var defaults = new Sites.SiteSettingsDefaults
        {
            ContactName = " שם ", ContactPhone = "050-1234567", DeliveryFeeText = "משלוח בתוספת תשלום",
            KashrutText = " ", BackgroundImageUrl = "https://example.com/background.jpg",
        };
        await using (var db = _factory.CreateDbContext())
        {
            // The factory's start applied its (empty) defaults; this is a database that hasn't had them yet.
            var row = await db.Settings.SingleAsync();
            Assert.True(row.SiteDefaultsApplied);
            row.SiteDefaultsApplied = false;
            row.DeliveryAreaText = "של האדמין";
            await db.SaveChangesAsync();
            await Data.DatabaseInitializer.SeedSiteSettingsAsync(db, defaults, logger);
        }

        var settings = await _admin.GetAsync("/api/admin/settings").Read<SettingsDto>();
        Assert.Equal("משלוח בתוספת תשלום", settings.DeliveryFeeText);
        Assert.Equal("של האדמין", settings.DeliveryAreaText);
        Assert.Null(settings.KashrutText);
        Assert.Equal("https://example.com/background.jpg", settings.BackgroundImageUrl);
        var site = await _factory.CreateApiClient().GetAsync("/api/site").Read<Controllers.PublicController.SiteDto>();
        Assert.Equal(new Controllers.PublicController.ContactDto("שם", "050-1234567", null, null, null), site.Contact);

        // Cleared by the admin: a restart leaves it empty.
        (await _admin.PutAsJsonAsync("/api/admin/settings", Input())).EnsureSuccessStatusCode();
        await using (var db = _factory.CreateDbContext())
            await Data.DatabaseInitializer.SeedSiteSettingsAsync(db, defaults, logger);
        Assert.Null((await _admin.GetAsync("/api/admin/settings").Read<SettingsDto>()).DeliveryFeeText);
    }

    private static object StyleInput(string? style) =>
        new { deliveryEnabled = true, pickupEnabled = true, style };

    [Fact]
    public async Task The_admin_picks_the_site_style()
    {
        var client = _factory.CreateApiClient();
        Assert.Equal("classic", (await _admin.GetAsync("/api/admin/settings").Read<SettingsDto>()).Style);
        Assert.Equal("classic", (await client.GetAsync("/api/site").Read<Controllers.PublicController.SiteDto>()).Style);

        Assert.Equal("street", (await (await _admin.PutAsJsonAsync("/api/admin/settings", StyleInput("street"))).Read<SettingsDto>()).Style);
        Assert.Equal("street", (await client.GetAsync("/api/site").Read<Controllers.PublicController.SiteDto>()).Style);

        // Left out by an older client: unchanged.
        Assert.Equal("street", (await (await _admin.PutAsJsonAsync("/api/admin/settings", Input())).Read<SettingsDto>()).Style);
        await (await _admin.PutAsJsonAsync("/api/admin/settings", StyleInput("neon"))).AssertInvalid("Style", "invalid");
    }

    [Fact]
    public async Task The_site_default_style_applies_until_the_admin_picks_one()
    {
        using var factory = new ApiFactory(postgres, new() { ["Site:Settings:Style"] = "street" });
        var admin = await factory.CreateAdminClientAsync();
        Assert.Equal("street", (await factory.CreateApiClient().GetAsync("/api/site").Read<Controllers.PublicController.SiteDto>()).Style);

        (await admin.PutAsJsonAsync("/api/admin/settings", StyleInput("classic"))).EnsureSuccessStatusCode();
        Assert.Equal("classic", (await factory.CreateApiClient().GetAsync("/api/site").Read<Controllers.PublicController.SiteDto>()).Style);
    }

    [Fact]
    public async Task The_admin_picks_where_the_order_total_sits_and_how_the_menu_is_paged()
    {
        var client = _factory.CreateApiClient();
        var settings = await _admin.GetAsync("/api/admin/settings").Read<SettingsDto>();
        Assert.Equal(("bottom", "page"), (settings.OrderTotalPosition, settings.OrderFlow));

        var saved = await (await _admin.PutAsJsonAsync("/api/admin/settings",
            new { deliveryEnabled = true, pickupEnabled = true, orderTotalPosition = "side", orderFlow = "steps" })).Read<SettingsDto>();
        Assert.Equal(("side", "steps"), (saved.OrderTotalPosition, saved.OrderFlow));
        var site = await client.GetAsync("/api/site").Read<Controllers.PublicController.SiteDto>();
        Assert.Equal(("side", "steps"), (site.OrderTotalPosition, site.OrderFlow));

        // Left out by an older client, or by another section's save: unchanged. One at a time is fine too.
        saved = await (await _admin.PutAsJsonAsync("/api/admin/settings", Input())).Read<SettingsDto>();
        Assert.Equal(("side", "steps"), (saved.OrderTotalPosition, saved.OrderFlow));
        saved = await (await _admin.PutAsJsonAsync("/api/admin/settings",
            new { deliveryEnabled = true, pickupEnabled = true, orderFlow = "page" })).Read<SettingsDto>();
        Assert.Equal(("side", "page"), (saved.OrderTotalPosition, saved.OrderFlow));

        await (await _admin.PutAsJsonAsync("/api/admin/settings",
            new { deliveryEnabled = true, pickupEnabled = true, orderTotalPosition = "top" })).AssertInvalid("OrderTotalPosition", "invalid");
        await (await _admin.PutAsJsonAsync("/api/admin/settings",
            new { deliveryEnabled = true, pickupEnabled = true, orderFlow = "wizard" })).AssertInvalid("OrderFlow", "invalid");
    }

    [Fact]
    public async Task The_site_default_order_layout_applies_until_the_admin_picks_one()
    {
        using var factory = new ApiFactory(postgres, new() { ["Site:Settings:OrderTotalPosition"] = "side", ["Site:Settings:OrderFlow"] = "steps" });
        var admin = await factory.CreateAdminClientAsync();
        var site = await factory.CreateApiClient().GetAsync("/api/site").Read<Controllers.PublicController.SiteDto>();
        Assert.Equal(("side", "steps"), (site.OrderTotalPosition, site.OrderFlow));

        (await admin.PutAsJsonAsync("/api/admin/settings",
            new { deliveryEnabled = true, pickupEnabled = true, orderTotalPosition = "bottom" })).EnsureSuccessStatusCode();
        site = await factory.CreateApiClient().GetAsync("/api/site").Read<Controllers.PublicController.SiteDto>();
        Assert.Equal(("bottom", "steps"), (site.OrderTotalPosition, site.OrderFlow));
    }

    [Fact]
    public async Task The_admin_picks_the_corners_and_leaving_them_out_keeps_them()
    {
        var client = _factory.CreateApiClient();
        var settings = await _admin.GetAsync("/api/admin/settings").Read<SettingsDto>();
        Assert.Equal("rounded", settings.Corners);

        var saved = await (await _admin.PutAsJsonAsync("/api/admin/settings",
            new { deliveryEnabled = true, pickupEnabled = true, corners = "square" })).Read<SettingsDto>();
        Assert.Equal("square", saved.Corners);
        var site = await client.GetAsync("/api/site").Read<Controllers.PublicController.SiteDto>();
        Assert.Equal("square", site.Corners);

        saved = await (await _admin.PutAsJsonAsync("/api/admin/settings", Input())).Read<SettingsDto>();
        Assert.Equal("square", saved.Corners);

        await (await _admin.PutAsJsonAsync("/api/admin/settings",
            new { deliveryEnabled = true, pickupEnabled = true, corners = "oval" })).AssertInvalid("Corners", "invalid");
    }

    [Fact]
    public async Task The_site_default_corners_apply_until_the_admin_picks_them()
    {
        using var factory = new ApiFactory(postgres, new() { ["Site:Settings:Corners"] = "round" });
        var admin = await factory.CreateAdminClientAsync();
        var site = await factory.CreateApiClient().GetAsync("/api/site").Read<Controllers.PublicController.SiteDto>();
        Assert.Equal("round", site.Corners);

        (await admin.PutAsJsonAsync("/api/admin/settings",
            new { deliveryEnabled = true, pickupEnabled = true, corners = "slight" })).EnsureSuccessStatusCode();
        site = await factory.CreateApiClient().GetAsync("/api/site").Read<Controllers.PublicController.SiteDto>();
        Assert.Equal("slight", site.Corners);
    }

    [Fact]
    public async Task The_admin_picks_a_palette_custom_colors_and_line_width_and_leaving_them_out_keeps_them()
    {
        var settings = await _admin.GetAsync("/api/admin/settings").Read<SettingsDto>();
        Assert.Equal(("site", 0, null), (settings.Palette, settings.CustomColors.Count, settings.LineWidth));

        var saved = await (await _admin.PutAsJsonAsync("/api/admin/settings", new
        {
            deliveryEnabled = true, pickupEnabled = true, palette = "berry", lineWidth = 3,
            customColors = new Dictionary<string, string> { ["button"] = "#AA0000", ["menuText"] = "#ffffff" },
        })).Read<SettingsDto>();
        Assert.Equal("berry", saved.Palette);
        Assert.Equal(3, saved.LineWidth);
        Assert.Equal("#aa0000", saved.CustomColors["button"]);

        var site = await _factory.CreateApiClient().GetAsync("/api/site").Read<Controllers.PublicController.SiteDto>();
        Assert.Equal(("berry", 2, 3), (site.Palette, site.CustomColors.Count, site.LineWidth));

        saved = await (await _admin.PutAsJsonAsync("/api/admin/settings", Input())).Read<SettingsDto>();
        Assert.Equal(("berry", 2, 3), (saved.Palette, saved.CustomColors.Count, saved.LineWidth));

        saved = await (await _admin.PutAsJsonAsync("/api/admin/settings", new
        {
            deliveryEnabled = true, pickupEnabled = true, lineWidth = 0, customColors = new Dictionary<string, string>(),
        })).Read<SettingsDto>();
        Assert.Equal(("berry", 0, null), (saved.Palette, saved.CustomColors.Count, saved.LineWidth));

        await (await _admin.PutAsJsonAsync("/api/admin/settings",
            new { deliveryEnabled = true, pickupEnabled = true, palette = "neon" })).AssertInvalid("Palette", "invalid");
        await (await _admin.PutAsJsonAsync("/api/admin/settings",
            new { deliveryEnabled = true, pickupEnabled = true, customColors = new Dictionary<string, string> { ["button"] = "red" } })).AssertInvalid("CustomColors", "invalid");
        await (await _admin.PutAsJsonAsync("/api/admin/settings",
            new { deliveryEnabled = true, pickupEnabled = true, customColors = new Dictionary<string, string> { ["sidebar"] = "#000000" } })).AssertInvalid("CustomColors", "invalid");
        await (await _admin.PutAsJsonAsync("/api/admin/settings",
            new { deliveryEnabled = true, pickupEnabled = true, lineWidth = 9 })).AssertInvalid("LineWidth", "invalid");
    }

    [Fact]
    public async Task The_admin_picks_font_shadows_and_spacing_and_leaving_them_out_keeps_them()
    {
        var settings = await _admin.GetAsync("/api/admin/settings").Read<SettingsDto>();
        Assert.Equal(("standard", "standard", "standard"), (settings.Font, settings.Shadows, settings.Spacing));

        var saved = await (await _admin.PutAsJsonAsync("/api/admin/settings",
            new { deliveryEnabled = true, pickupEnabled = true, font = "elegant", shadows = "soft", spacing = "compact" })).Read<SettingsDto>();
        Assert.Equal(("elegant", "soft", "compact"), (saved.Font, saved.Shadows, saved.Spacing));
        var site = await _factory.CreateApiClient().GetAsync("/api/site").Read<Controllers.PublicController.SiteDto>();
        Assert.Equal(("elegant", "soft", "compact"), (site.Font, site.Shadows, site.Spacing));

        saved = await (await _admin.PutAsJsonAsync("/api/admin/settings", Input())).Read<SettingsDto>();
        Assert.Equal(("elegant", "soft", "compact"), (saved.Font, saved.Shadows, saved.Spacing));

        await (await _admin.PutAsJsonAsync("/api/admin/settings",
            new { deliveryEnabled = true, pickupEnabled = true, font = "comic" })).AssertInvalid("Font", "invalid");
        await (await _admin.PutAsJsonAsync("/api/admin/settings",
            new { deliveryEnabled = true, pickupEnabled = true, shadows = "glow" })).AssertInvalid("Shadows", "invalid");
        await (await _admin.PutAsJsonAsync("/api/admin/settings",
            new { deliveryEnabled = true, pickupEnabled = true, spacing = "huge" })).AssertInvalid("Spacing", "invalid");
    }

    [Fact]
    public async Task A_colour_can_be_copied_from_another_element_but_not_in_a_circle()
    {
        var saved = await (await _admin.PutAsJsonAsync("/api/admin/settings", new
        {
            deliveryEnabled = true, pickupEnabled = true,
            customColors = new Dictionary<string, string> { ["button"] = "#aa0000", ["menu"] = "=button", ["categoryBackground"] = "#ffeecc" },
        })).Read<SettingsDto>();
        Assert.Equal("=button", saved.CustomColors["menu"]);
        Assert.Equal("#ffeecc", saved.CustomColors["categoryBackground"]);

        foreach (var colors in new[]
        {
            new Dictionary<string, string> { ["menu"] = "=menu" },
            new Dictionary<string, string> { ["menu"] = "=button", ["button"] = "=menu" },
            new Dictionary<string, string> { ["menu"] = "=sidebar" },
        })
            await (await _admin.PutAsJsonAsync("/api/admin/settings",
                new { deliveryEnabled = true, pickupEnabled = true, customColors = colors })).AssertInvalid("CustomColors", "invalid");
    }

    [Fact]
    public async Task The_admin_picks_how_the_tiles_style_shows_categories()
    {
        var settings = await _admin.GetAsync("/api/admin/settings").Read<SettingsDto>();
        Assert.Equal("framed", settings.TileGroups);

        var saved = await (await _admin.PutAsJsonAsync("/api/admin/settings",
            new { deliveryEnabled = true, pickupEnabled = true, tileGroups = "minimal" })).Read<SettingsDto>();
        Assert.Equal("minimal", saved.TileGroups);
        var site = await _factory.CreateApiClient().GetAsync("/api/site").Read<Controllers.PublicController.SiteDto>();
        Assert.Equal("minimal", site.TileGroups);

        saved = await (await _admin.PutAsJsonAsync("/api/admin/settings", Input())).Read<SettingsDto>();
        Assert.Equal("minimal", saved.TileGroups);
        await (await _admin.PutAsJsonAsync("/api/admin/settings",
            new { deliveryEnabled = true, pickupEnabled = true, tileGroups = "wild" })).AssertInvalid("TileGroups", "invalid");
    }

    [Fact]
    public async Task The_site_default_palette_applies_until_the_admin_picks_one()
    {
        using var factory = new ApiFactory(postgres, new() { ["Site:Settings:Palette"] = "olive" });
        var admin = await factory.CreateAdminClientAsync();
        var site = await factory.CreateApiClient().GetAsync("/api/site").Read<Controllers.PublicController.SiteDto>();
        Assert.Equal("olive", site.Palette);

        (await admin.PutAsJsonAsync("/api/admin/settings",
            new { deliveryEnabled = true, pickupEnabled = true, palette = "ocean" })).EnsureSuccessStatusCode();
        site = await factory.CreateApiClient().GetAsync("/api/site").Read<Controllers.PublicController.SiteDto>();
        Assert.Equal("ocean", site.Palette);
    }

    [Fact]
    public async Task A_service_city_longer_than_an_address_part_is_rejected()
    {
        var response = await _admin.PutAsJsonAsync("/api/admin/settings", Input(cities: "אשקלון, " + new string('א', 101)));
        await response.AssertInvalid("ServiceCities", "tooLong");
    }

    [Theory]
    [InlineData("GET", "/api/admin/settings")]
    [InlineData("PUT", "/api/admin/settings")]
    [InlineData("PUT", "/api/admin/settings/background")]
    [InlineData("GET", "/api/admin/supply-days")]
    [InlineData("GET", "/api/admin/closed-dates")]
    [InlineData("GET", "/api/admin/categories")]
    [InlineData("POST", "/api/admin/categories")]
    [InlineData("GET", "/api/admin/dishes")]
    [InlineData("POST", "/api/admin/dishes")]
    [InlineData("DELETE", "/api/admin/dishes/1")]
    [InlineData("POST", "/api/admin/dishes/1/images")]
    public async Task Admin_endpoints_need_an_admin_session(string method, string path)
    {
        HttpContent body = path.EndsWith("/background") || path.EndsWith("/images") ? TestFiles.Upload(TestFiles.Jpeg) : JsonContent.Create(new { });
        var request = new HttpRequestMessage(new HttpMethod(method), path) { Content = body };
        var response = await _factory.CreateApiClient().SendAsync(request);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Settings_save_and_trim_text()
    {
        var saved = await (await _admin.PutAsJsonAsync("/api/admin/settings", Input())).Read<SettingsDto>();

        Assert.Equal("חיפה והקריות", saved.DeliveryAreaText);
        Assert.Null(saved.DeliveryFeeText);
        Assert.Equal("050-1234567", saved.PaymentPhone);
        Assert.Equal(80m, saved.MinimumOrderAmount);
        Assert.True(saved.MinimumOrderAppliesToPickup);
        var loaded = await (await _admin.GetAsync("/api/admin/settings")).Read<SettingsDto>();
        Assert.Equal(saved with { CustomColors = loaded.CustomColors }, loaded);
    }

    [Fact]
    public async Task The_minimum_for_pickup_is_kept_when_an_older_client_leaves_it_out()
    {
        var off = await (await _admin.PutAsJsonAsync("/api/admin/settings",
            new { deliveryEnabled = true, pickupEnabled = true, minimumOrderAmount = 80m, minimumOrderAppliesToPickup = false })).Read<SettingsDto>();
        Assert.False(off.MinimumOrderAppliesToPickup);

        var kept = await (await _admin.PutAsJsonAsync("/api/admin/settings", Input())).Read<SettingsDto>();
        Assert.False(kept.MinimumOrderAppliesToPickup);
    }

    [Fact]
    public async Task Address_first_is_off_by_default_and_kept_when_left_out()
    {
        var site = _factory.CreateApiClient();
        Assert.False((await site.GetAsync("/api/site").Read<Controllers.PublicController.SiteDto>()).AddressFirst);

        var on = await (await _admin.PutAsJsonAsync("/api/admin/settings",
            new { deliveryEnabled = true, pickupEnabled = true, addressFirst = true })).Read<SettingsDto>();
        Assert.True(on.AddressFirst);
        Assert.True((await site.GetAsync("/api/site").Read<Controllers.PublicController.SiteDto>()).AddressFirst);

        var kept = await (await _admin.PutAsJsonAsync("/api/admin/settings", Input())).Read<SettingsDto>();
        Assert.True(kept.AddressFirst);
    }

    [Fact]
    public async Task Tracking_ids_are_off_by_default_cleaned_shown_to_the_site_and_kept_when_left_out()
    {
        var site = _factory.CreateApiClient();
        Assert.Equal("", (await _admin.GetAsync("/api/admin/settings").Read<SettingsDto>()).Tracking.MetaPixelId);
        Assert.Equal("", (await site.GetAsync("/api/site").Read<Controllers.PublicController.SiteDto>()).Tracking!.MetaPixelId);

        var saved = await (await _admin.PutAsJsonAsync("/api/admin/settings/tracking",
            new { metaPixelId = " 123456789012345 ", googleAnalyticsId = "g-abc123xyz9", googleTagManagerId = "gtm-abc123", tikTokPixelId = "" })).Read<SettingsDto>();
        Assert.Equal(new Sites.Tracking.Ids("123456789012345", "G-ABC123XYZ9", "GTM-ABC123", "", "", "", false), saved.Tracking);
        Assert.Equal(saved.Tracking, (await site.GetAsync("/api/site").Read<Controllers.PublicController.SiteDto>()).Tracking);

        // Saving the other settings leaves the ids alone, and an id left out of its own save is kept.
        var kept = await (await _admin.PutAsJsonAsync("/api/admin/settings", Input())).Read<SettingsDto>();
        Assert.Equal(saved.Tracking, kept.Tracking);
        var partial = await (await _admin.PutAsJsonAsync("/api/admin/settings/tracking", new { tikTokPixelId = "C1ABCDEF2GHIJKLMN3OP" })).Read<SettingsDto>();
        Assert.Equal(saved.Tracking with { TikTokPixelId = "C1ABCDEF2GHIJKLMN3OP" }, partial.Tracking);

        var cleared = await (await _admin.PutAsJsonAsync("/api/admin/settings/tracking",
            new { metaPixelId = "", googleAnalyticsId = "", googleTagManagerId = "", tikTokPixelId = "" })).Read<SettingsDto>();
        Assert.Equal(Sites.Tracking.Ids.None, cleared.Tracking);
    }

    [Theory]
    [InlineData("metaPixelId", "https://facebook.com/mypage", "MetaPixelId")]
    [InlineData("metaPixelId", "12345", "MetaPixelId")]
    [InlineData("googleAnalyticsId", "UA-1234", "GoogleAnalyticsId")]
    [InlineData("googleTagManagerId", "GTM-'+alert(1)+'", "GoogleTagManagerId")]
    [InlineData("tikTokPixelId", "abc'; x", "TikTokPixelId")]
    [InlineData("googleAdsId", "AW-12", "GoogleAdsId")]
    [InlineData("googleAdsPurchaseLabel", "a'); alert(1);//", "GoogleAdsPurchaseLabel")]
    [InlineData("metaAccessToken", "short", "MetaAccessToken")]
    public async Task A_tracking_id_in_the_wrong_shape_is_rejected(string field, string value, string error)
    {
        var tracking = new Dictionary<string, string> { [field] = value };
        var response = await _admin.PutAsJsonAsync("/api/admin/settings/tracking", tracking);
        await response.AssertInvalid(error, "trackingId");
    }

    [Fact]
    public async Task A_zero_minimum_means_no_minimum_and_a_negative_one_is_rejected()
    {
        var none = await (await _admin.PutAsJsonAsync("/api/admin/settings", Input(minimum: 0m))).Read<SettingsDto>();
        Assert.Null(none.MinimumOrderAmount);
        await (await _admin.PutAsJsonAsync("/api/admin/settings", Input(minimum: -1m))).AssertInvalid("MinimumOrderAmount", "invalid");
    }

    [Fact]
    public async Task Delivery_and_pickup_cannot_both_be_off()
    {
        var response = await _admin.PutAsJsonAsync("/api/admin/settings", Input(delivery: false, pickup: false));
        await response.AssertInvalid("DeliveryEnabled", "fulfillmentRequired");
    }

    [Theory]
    [InlineData("12")]
    [InlineData("phone")]
    [InlineData("050-12a4567")]
    public async Task Payment_phone_must_look_like_a_phone(string phone)
    {
        var response = await _admin.PutAsJsonAsync("/api/admin/settings", Input(phone: phone));
        await response.AssertInvalid("PaymentPhone", "phone");
    }

    [Fact]
    public async Task Long_texts_are_rejected()
    {
        var response = await _admin.PutAsJsonAsync("/api/admin/settings", Input(kashrut: new string('א', MaxText + 1)));
        await response.AssertInvalid("KashrutText", "tooLong");
    }

    private const int MaxText = FoodSite.Api.Controllers.Admin.SettingsController.TextMaxLength;

    [Fact]
    public async Task Background_picture_upload_replaces_and_removes_the_old_one()
    {
        var first = await (await _admin.PutAsync("/api/admin/settings/background", TestFiles.Upload(TestFiles.Jpeg))).Read<SettingsDto>();
        Assert.StartsWith($"https://images.test/{ApiFactory.SiteId}/background/", first.BackgroundImageUrl);

        var second = await (await _admin.PutAsync("/api/admin/settings/background", TestFiles.Upload(TestFiles.Png, "bg.png", "image/png"))).Read<SettingsDto>();
        Assert.NotEqual(first.BackgroundImageUrl, second.BackgroundImageUrl);
        Assert.Single(_factory.Images.Deleted);

        var removed = await (await _admin.DeleteAsync("/api/admin/settings/background")).Read<SettingsDto>();
        Assert.Null(removed.BackgroundImageUrl);
        Assert.Equal(2, _factory.Images.Deleted.Count);
    }

    [Fact]
    public async Task Background_rejects_files_that_are_not_pictures()
    {
        var response = await _admin.PutAsync("/api/admin/settings/background",
            TestFiles.Upload("<svg/>"u8.ToArray(), "x.jpg", "image/jpeg"));
        await response.AssertInvalid("file", "imageType");
        Assert.Empty(_factory.Images.Uploads);
    }

    [Fact]
    public async Task Background_rejects_pictures_over_5_MB()
    {
        var big = new byte[5 * 1024 * 1024 + 1];
        TestFiles.Jpeg.CopyTo(big, 0);
        var response = await _admin.PutAsync("/api/admin/settings/background", TestFiles.Upload(big));
        await response.AssertInvalid("file", "imageTooLarge");
    }

    [Fact]
    public async Task Upload_reports_when_the_image_store_is_unavailable()
    {
        _factory.Images.Unavailable = true;
        var response = await _admin.PutAsync("/api/admin/settings/background", TestFiles.Upload(TestFiles.Webp, "a.webp", "image/webp"));

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Contains("imageStoreUnavailable", await response.Content.ReadAsStringAsync());
        Assert.Null((await (await _admin.GetAsync("/api/admin/settings")).Read<SettingsDto>()).BackgroundImageUrl);
    }

    [Fact]
    public async Task Upload_reports_when_the_image_store_refuses_it()
    {
        _factory.Images.Refuses = true;
        var response = await _admin.PutAsync("/api/admin/settings/background", TestFiles.Upload(TestFiles.Webp, "a.webp", "image/webp"));

        Assert.Equal(HttpStatusCode.BadGateway, response.StatusCode);
        Assert.Contains("imageUploadFailed", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Supply_days_list_all_weekdays_from_Sunday_disabled_by_default()
    {
        var days = await (await _admin.GetAsync("/api/admin/supply-days")).Read<List<SupplyDayDto>>();

        Assert.Equal(Enum.GetValues<DayOfWeek>(), days.Select(d => d.Weekday));
        Assert.All(days, d => Assert.False(d.Enabled));
        Assert.Equal((DayOfWeek.Friday, false, DayOfWeek.Thursday, new TimeOnly(20, 0)), (days[5].Weekday, days[5].Enabled, days[5].CutoffDay, days[5].CutoffTime));
        Assert.All(days, d => Assert.Empty(d.Hours!));
    }

    [Fact]
    public async Task Supply_days_save_cutoffs()
    {
        var days = await (await _admin.GetAsync("/api/admin/supply-days")).Read<List<SupplyDayDto>>();
        days[5] = new SupplyDayDto(DayOfWeek.Friday, true, DayOfWeek.Wednesday, new TimeOnly(20, 0), []);
        days[3] = days[3] with { Enabled = true };

        var saved = await (await _admin.PutAsJsonAsync("/api/admin/supply-days", days, TestFiles.Json)).Read<List<SupplyDayDto>>();
        Assert.Equal(days.Select(d => (d.Weekday, d.Enabled, d.CutoffDay, d.CutoffTime)), saved.Select(d => (d.Weekday, d.Enabled, d.CutoffDay, d.CutoffTime)));

        days[5] = days[5] with { Enabled = false };
        saved = await (await _admin.PutAsJsonAsync("/api/admin/supply-days", days, TestFiles.Json)).Read<List<SupplyDayDto>>();
        Assert.False(saved[5].Enabled);
        Assert.Equal(DayOfWeek.Wednesday, saved[5].CutoffDay);
    }

    [Fact]
    public async Task Supply_days_save_working_hours_as_separate_ranges()
    {
        var days = await (await _admin.GetAsync("/api/admin/supply-days")).Read<List<SupplyDayDto>>();
        // A split day: the early hour after midnight, and 11:00 until midnight (00:00 ends the day).
        days[5] = days[5] with
        {
            Enabled = true,
            Hours = [new(new TimeOnly(11, 0), new TimeOnly(0, 0)), new(new TimeOnly(0, 0), new TimeOnly(1, 0))],
        };
        var saved = await (await _admin.PutAsJsonAsync("/api/admin/supply-days", days, TestFiles.Json)).Read<List<SupplyDayDto>>();
        Assert.Equal(
            [(new TimeOnly(0, 0), new TimeOnly(1, 0)), (new TimeOnly(11, 0), new TimeOnly(0, 0))],
            saved[5].Hours!.Select(h => (h.From, h.To)));

        var backwards = days.ToList();
        backwards[5] = days[5] with { Hours = [new(new TimeOnly(18, 0), new TimeOnly(8, 0))] };
        await (await _admin.PutAsJsonAsync("/api/admin/supply-days", backwards, TestFiles.Json)).AssertInvalid("days[5].hours", "deliveryHoursInvalid");
        var overlapping = days.ToList();
        overlapping[5] = days[5] with { Hours = [new(new TimeOnly(9, 0), new TimeOnly(13, 0)), new(new TimeOnly(12, 0), new TimeOnly(15, 0))] };
        await (await _admin.PutAsJsonAsync("/api/admin/supply-days", overlapping, TestFiles.Json)).AssertInvalid("days[5].hours", "deliveryHoursOverlap");

        // Saving none clears the day's hours.
        days[5] = days[5] with { Hours = [] };
        saved = await (await _admin.PutAsJsonAsync("/api/admin/supply-days", days, TestFiles.Json)).Read<List<SupplyDayDto>>();
        Assert.Empty(saved[5].Hours!);
    }

    [Fact]
    public async Task Shabbat_rules_are_saved_checked_and_previewed()
    {
        var empty = await (await _admin.GetAsync("/api/admin/shabbat-rules")).Read<ShabbatRulesController.RulesDto>();
        Assert.Null(empty.Rules.City);
        Assert.Null(empty.Preview);
        Assert.Contains(empty.Cities, c => c.Id == "gedera");

        var rules = ShabbatRules.Empty with
        {
            City = "gedera",
            Shabbat = new(new(ShabbatRules.Before, null, 2.5m), new(ShabbatRules.After, null, 0.5m)),
            Holiday = new(new(ShabbatRules.Fixed, "13:00"), new(ShabbatRules.Closed)),
        };
        var saved = await (await _admin.PutAsJsonAsync("/api/admin/shabbat-rules", rules, TestFiles.Json)).Read<ShabbatRulesController.RulesDto>();
        Assert.Equal(2.5m, saved.Rules.Shabbat.Eve.Hours);
        Assert.NotNull(saved.Preview);

        var withoutCity = rules with { City = null };
        await (await _admin.PutAsJsonAsync("/api/admin/shabbat-rules", withoutCity, TestFiles.Json)).AssertInvalid("city", "required");
        var thirds = rules with { Shabbat = new(new(ShabbatRules.Before, null, 1.3m), new()) };
        await (await _admin.PutAsJsonAsync("/api/admin/shabbat-rules", thirds, TestFiles.Json)).AssertInvalid("shabbat.eve.hours", "invalid");
    }

    [Fact]
    public async Task Orders_per_hour_is_saved_and_zero_means_no_limit()
    {
        var settings = await _admin.GetAsync("/api/admin/settings").Read<SettingsDto>();
        Assert.Null(settings.OrdersPerHour);
        Assert.Equal(3, (await (await _admin.PutAsJsonAsync("/api/admin/settings", settings with { OrdersPerHour = 3 })).Read<SettingsDto>()).OrdersPerHour);
        Assert.Null((await (await _admin.PutAsJsonAsync("/api/admin/settings", settings with { OrdersPerHour = 0 })).Read<SettingsDto>()).OrdersPerHour);
        await (await _admin.PutAsJsonAsync("/api/admin/settings", settings with { OrdersPerHour = -1 })).AssertInvalid("OrdersPerHour", "invalid");
    }

    [Fact]
    public async Task Portions_per_supply_date_is_saved_and_zero_means_no_limit()
    {
        var settings = await _admin.GetAsync("/api/admin/settings").Read<SettingsDto>();
        Assert.Null(settings.PortionsPerSupplyDate);
        Assert.Equal(30, (await (await _admin.PutAsJsonAsync("/api/admin/settings", settings with { PortionsPerSupplyDate = 30 })).Read<SettingsDto>()).PortionsPerSupplyDate);
        Assert.Null((await (await _admin.PutAsJsonAsync("/api/admin/settings", settings with { PortionsPerSupplyDate = 0 })).Read<SettingsDto>()).PortionsPerSupplyDate);
        await (await _admin.PutAsJsonAsync("/api/admin/settings", settings with { PortionsPerSupplyDate = -1 })).AssertInvalid("PortionsPerSupplyDate", "invalid");
    }

    [Fact]
    public async Task Supply_days_need_each_weekday_once()
    {
        var days = await (await _admin.GetAsync("/api/admin/supply-days")).Read<List<SupplyDayDto>>();
        days[6] = days[0];
        var response = await _admin.PutAsJsonAsync("/api/admin/supply-days", days, TestFiles.Json);
        await response.AssertInvalid("days", "allWeekdaysRequired");
    }

    [Fact]
    public async Task Closed_dates_are_added_listed_in_order_and_removed()
    {
        var later = await (await _admin.PostAsJsonAsync("/api/admin/closed-dates", new { date = "2026-10-14", reason = " סוכות " })).Read<ClosedDateDto>();
        await (await _admin.PostAsJsonAsync("/api/admin/closed-dates", new { date = "2026-10-02" })).Read<ClosedDateDto>();

        var list = await (await _admin.GetAsync("/api/admin/closed-dates")).Read<List<ClosedDateDto>>();
        Assert.Equal([new DateOnly(2026, 10, 2), new DateOnly(2026, 10, 14)], list.Select(c => c.Date));
        Assert.Equal("סוכות", later.Reason);

        Assert.Equal(HttpStatusCode.NoContent, (await _admin.DeleteAsync($"/api/admin/closed-dates/{later.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _admin.DeleteAsync($"/api/admin/closed-dates/{later.Id}")).StatusCode);
        Assert.Single(await (await _admin.GetAsync("/api/admin/closed-dates")).Read<List<ClosedDateDto>>());
    }

    [Fact]
    public async Task A_closed_date_can_only_be_added_once()
    {
        await (await _admin.PostAsJsonAsync("/api/admin/closed-dates", new { date = "2026-12-25" })).Read<ClosedDateDto>();
        var response = await _admin.PostAsJsonAsync("/api/admin/closed-dates", new { date = "2026-12-25" });
        await response.AssertInvalid("Date", "duplicate");
    }
}
