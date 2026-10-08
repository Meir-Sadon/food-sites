using System.Net;
using System.Net.Http.Json;
using FoodSite.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using static FoodSite.Api.Controllers.AccountController;
using static FoodSite.Api.Controllers.Admin.MessageTemplatesController;
using static FoodSite.Api.Controllers.Admin.ReviewsAdminController;
using static FoodSite.Api.Controllers.ReviewsController;

namespace FoodSite.Api.Tests;

/// <summary>WhatsApp message templates, review links, the client's review page, and approving reviews for the home page.</summary>
[Collection(PostgresCollection.Name)]
public sealed class ReviewsTests(PostgresFixture postgres) : IAsyncLifetime
{
    private readonly ApiFactory _factory = new(postgres);
    private HttpClient _admin = null!;
    private HttpClient _guest = null!;

    public async Task InitializeAsync()
    {
        _admin = await _factory.CreateAdminClientAsync();
        _guest = _factory.CreateApiClient();
    }

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private async Task<int> SeedOrder(string name = "דנה כהן", int? userId = null)
    {
        await using var db = _factory.CreateDbContext();
        var order = new Order
        {
            UserId = userId,
            Phone = "0501234567", Name = name, Address = "אשקלון", SupplyDate = new DateOnly(2030, 1, 6),
            PaymentMethod = PaymentMethod.OnDelivery, Total = 100, CreatedAt = DateTimeOffset.UtcNow,
        };
        db.Orders.Add(order);
        await db.SaveChangesAsync();
        return order.Id;
    }

    private async Task<string> LinkFor(int orderId) =>
        (await _admin.PostAsync($"/api/admin/reviews/for-order/{orderId}", null).Read<ReviewLinkDto>()).Token;

    private Task<HttpResponseMessage> Submit(string token, int rating = 5, string? comment = "מעולה", string? name = "דנה") =>
        _guest.PostAsJsonAsync($"/api/reviews/{token}", new { rating, comment, name });

    [Fact]
    public async Task A_new_site_starts_with_a_default_message_for_each_order_status()
    {
        var templates = await _admin.GetAsync("/api/admin/message-templates").Read<List<TemplateDto>>();
        Assert.Equal(Enum.GetValues<OrderStatus>().Cast<OrderStatus?>(), templates.Select(t => t.ForStatus));
        Assert.All(templates, t => Assert.False(string.IsNullOrWhiteSpace(t.Text)));
        // Only the after-delivery message asks for a review.
        Assert.Equal([OrderStatus.Delivered], templates.Where(t => t.IncludeReviewLink).Select(t => t.ForStatus!.Value));
    }

    [Fact]
    public async Task The_admin_adds_edits_and_removes_templates()
    {
        var created = await _admin.PostAsJsonAsync("/api/admin/message-templates", new { name = "מוכן", text = "ההזמנה מוכנה", includeReviewLink = false })
            .Read<TemplateDto>();
        var updated = await _admin.PutAsJsonAsync($"/api/admin/message-templates/{created.Id}", new { name = "מוכן!", text = "מוכנה לאיסוף", includeReviewLink = true, forStatus = "Ready" })
            .Read<TemplateDto>();
        Assert.Equal(new TemplateDto(created.Id, "מוכן!", "מוכנה לאיסוף", true, OrderStatus.Ready), updated);

        Assert.Equal(HttpStatusCode.NoContent, (await _admin.DeleteAsync($"/api/admin/message-templates/{created.Id}")).StatusCode);
        Assert.DoesNotContain(await _admin.GetAsync("/api/admin/message-templates").Read<List<TemplateDto>>(), t => t.Id == created.Id);
    }

    [Fact]
    public async Task A_template_needs_a_name_and_text()
    {
        var response = await _admin.PostAsJsonAsync("/api/admin/message-templates", new { name = " ", text = new string('א', 1001) });
        await response.AssertInvalid("name", "required");
        await response.AssertInvalid("text", "tooLong");
    }

    [Fact]
    public async Task Templates_and_reviews_are_for_the_admin_only()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await _guest.GetAsync("/api/admin/message-templates")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _guest.GetAsync("/api/admin/reviews")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _guest.PostAsync("/api/admin/reviews/for-order/1", null)).StatusCode);
    }

    [Fact]
    public async Task An_order_keeps_one_review_link_that_starts_with_the_clients_first_name()
    {
        var orderId = await SeedOrder();
        var token = await LinkFor(orderId);
        Assert.Equal(10, token.Length);
        Assert.Equal(token, await LinkFor(orderId));

        var form = await _guest.GetAsync($"/api/reviews/{token}").Read<ReviewFormDto>();
        Assert.Equal(new ReviewFormDto("דנה", false, []), form with { Images = [] });
        Assert.Equal(HttpStatusCode.NotFound, (await _admin.PostAsync("/api/admin/reviews/for-order/999999", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _guest.GetAsync("/api/reviews/abcdefghij")).StatusCode);
    }

    [Fact]
    public async Task A_client_adds_up_to_two_pictures_and_sends_the_review_once()
    {
        var token = await LinkFor(await SeedOrder());

        var first = await _guest.PostAsync($"/api/reviews/{token}/images", TestFiles.Upload(TestFiles.Jpeg)).Read<ReviewFormDto>();
        await _guest.PostAsync($"/api/reviews/{token}/images", TestFiles.Upload(TestFiles.Png, "b.png", "image/png")).Read<ReviewFormDto>();
        var third = await _guest.PostAsync($"/api/reviews/{token}/images", TestFiles.Upload(TestFiles.Jpeg));
        await third.AssertInvalid("file", "tooManyImages");
        Assert.All(_factory.Images.Uploads, u => Assert.Equal($"{ApiFactory.SiteId}/reviews", u.Folder));

        var afterRemove = await _guest.DeleteAsync($"/api/reviews/{token}/images/{first.Images[0].Id}").Read<ReviewFormDto>();
        Assert.Single(afterRemove.Images);
        Assert.Single(_factory.Images.Deleted);

        Assert.Equal(HttpStatusCode.NoContent, (await Submit(token, 4, "  טעים מאוד  ", "דנה כ.")).StatusCode);

        var again = await Submit(token);
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        Assert.Contains("reviewAlreadySent", await again.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.Conflict, (await _guest.PostAsync($"/api/reviews/{token}/images", TestFiles.Upload(TestFiles.Jpeg))).StatusCode);
        Assert.True((await _guest.GetAsync($"/api/reviews/{token}").Read<ReviewFormDto>()).Submitted);

        var review = Assert.Single(await _admin.GetAsync("/api/admin/reviews").Read<List<AdminReviewDto>>());
        Assert.Equal((4, "טעים מאוד", "דנה כ.", ReviewStatus.Pending, "דנה כהן"), (review.Rating, review.Comment, review.Name, review.Status, review.OrderName));
        Assert.Single(review.Images);
    }

    [Fact]
    public async Task A_review_needs_one_to_five_stars()
    {
        var token = await LinkFor(await SeedOrder());
        await (await Submit(token, 0)).AssertInvalid("rating", "ratingRequired");
        await (await Submit(token, 6)).AssertInvalid("rating", "ratingRequired");
        await (await Submit(token, 3, new string('א', 1001))).AssertInvalid("comment", "tooLong");
    }

    [Fact]
    public async Task Only_approved_reviews_show_on_the_home_page()
    {
        var approved = await LinkFor(await SeedOrder("רון"));
        var blocked = await LinkFor(await SeedOrder("גל"));
        var unsent = await LinkFor(await SeedOrder("טל"));
        await Submit(approved, 5, "הכי טעים", "רון");
        await Submit(blocked, 1, "ספאם", "גל");
        Assert.Empty(await _guest.GetAsync("/api/reviews").Read<List<ReviewDto>>());

        var reviews = await _admin.GetAsync("/api/admin/reviews").Read<List<AdminReviewDto>>();
        Assert.Equal(2, reviews.Count);
        var (ron, gal) = (reviews.Single(r => r.Name == "רון"), reviews.Single(r => r.Name == "גל"));
        Assert.Equal(HttpStatusCode.NoContent, (await _admin.PutAsJsonAsync($"/api/admin/reviews/{ron.Id}/status", new { status = "Approved" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await _admin.PutAsJsonAsync($"/api/admin/reviews/{gal.Id}/status", new { status = "Blocked" })).StatusCode);

        var shown = Assert.Single(await _guest.GetAsync("/api/reviews").Read<List<ReviewDto>>());
        Assert.Equal(("רון", 5, "הכי טעים"), (shown.Name, shown.Rating, shown.Comment));
        Assert.Single(await _admin.GetAsync("/api/admin/reviews?status=Blocked").Read<List<AdminReviewDto>>());
        Assert.Equal(Review.TokenLength, unsent.Length);
    }

    [Fact]
    public async Task Reviews_answer_404_when_the_feature_is_off()
    {
        await using var factory = new ApiFactory(postgres, new() { ["Site:Features:reviews"] = null });
        var admin = await factory.CreateAdminClientAsync();
        var guest = factory.CreateApiClient();
        foreach (var response in new[]
        {
            await guest.GetAsync("/api/reviews"),
            await guest.GetAsync("/api/reviews/abcdefghij"),
            await admin.GetAsync("/api/admin/reviews"),
            await admin.PostAsync("/api/admin/reviews/for-order/1", null),
        })
        {
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            Assert.Contains("featureDisabled", await response.Content.ReadAsStringAsync());
        }
        // The message templates are not part of the feature.
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/api/admin/message-templates")).StatusCode);
    }

    [Fact]
    public async Task A_client_sees_the_reviews_they_sent_on_their_own_orders()
    {
        var register = await _guest.PostAsJsonAsync("/api/account/register", new
        {
            phone = "0501234567", fullName = "דנה כהן", city = "אשקלון", street = "הרצל", houseNumber = "1",
        }, TestFiles.Json);
        Assert.True(register.IsSuccessStatusCode, await register.Content.ReadAsStringAsync());
        var client = _factory.CreateApiClient();
        client.DefaultRequestHeaders.Add("Cookie",
            register.Headers.GetValues("Set-Cookie").Single(c => c.StartsWith(ApiFactory.SiteId + "_user=")).Split(';')[0]);
        int userId;
        await using (var db = _factory.CreateDbContext())
            userId = await db.Users.Where(u => u.Phone == "0501234567").Select(u => u.Id).SingleAsync();

        var mine = await LinkFor(await SeedOrder(userId: userId));
        var notSent = await LinkFor(await SeedOrder(userId: userId));
        var someoneElse = await LinkFor(await SeedOrder("גל"));
        await Submit(mine, 4, "טעים", "דנה");
        await Submit(someoneElse, 5, "מעולה", "גל");

        var reviews = await client.GetAsync("/api/account/reviews").Read<List<MyReviewDto>>();
        var review = Assert.Single(reviews);
        Assert.Equal((4, "טעים", ReviewStatus.Pending), (review.Rating, review.Comment, review.Status));
        Assert.Equal(HttpStatusCode.Unauthorized, (await _guest.GetAsync("/api/account/reviews")).StatusCode);
        Assert.NotEqual(mine, notSent);
    }
}
