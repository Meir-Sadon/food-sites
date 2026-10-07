using System.Net;
using System.Net.Http.Json;
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

    private static object Input(bool delivery = true, bool pickup = true, string? phone = "050-1234567", string? kashrut = "כשר", decimal? minimum = 80m) =>
        new { deliveryEnabled = delivery, pickupEnabled = pickup, deliveryAreaText = "  חיפה והקריות ", deliveryFeeText = "", kashrutText = kashrut, paymentPhone = phone, minimumOrderAmount = minimum };

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
        Assert.Equal(saved, await (await _admin.GetAsync("/api/admin/settings")).Read<SettingsDto>());
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
    public async Task Supply_days_list_all_weekdays_from_Sunday_disabled_by_default()
    {
        var days = await (await _admin.GetAsync("/api/admin/supply-days")).Read<List<SupplyDayDto>>();

        Assert.Equal(Enum.GetValues<DayOfWeek>(), days.Select(d => d.Weekday));
        Assert.All(days, d => Assert.False(d.Enabled));
        Assert.Equal(new SupplyDayDto(DayOfWeek.Friday, false, DayOfWeek.Thursday, new TimeOnly(20, 0)), days[5]);
    }

    [Fact]
    public async Task Supply_days_save_cutoffs()
    {
        var days = await (await _admin.GetAsync("/api/admin/supply-days")).Read<List<SupplyDayDto>>();
        days[5] = new SupplyDayDto(DayOfWeek.Friday, true, DayOfWeek.Wednesday, new TimeOnly(20, 0));
        days[3] = days[3] with { Enabled = true };

        var saved = await (await _admin.PutAsJsonAsync("/api/admin/supply-days", days, TestFiles.Json)).Read<List<SupplyDayDto>>();
        Assert.Equal(days, saved);

        days[5] = days[5] with { Enabled = false };
        saved = await (await _admin.PutAsJsonAsync("/api/admin/supply-days", days, TestFiles.Json)).Read<List<SupplyDayDto>>();
        Assert.False(saved[5].Enabled);
        Assert.Equal(DayOfWeek.Wednesday, saved[5].CutoffDay);
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
