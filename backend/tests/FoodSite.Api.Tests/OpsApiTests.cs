using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Ops;
using FoodSite.Api.Sites;
using Microsoft.EntityFrameworkCore;
using static FoodSite.Api.Controllers.Admin.AuditController;
using static FoodSite.Api.Controllers.Admin.FeedbackController;
using static FoodSite.Api.Controllers.Admin.OpsTokenController;
using static FoodSite.Api.Controllers.Ops.OpsController;
using static FoodSite.Api.Controllers.PublicController;

namespace FoodSite.Api.Tests;

/// <summary>Phase 6: the console's token, the ops API and the admin's "report a problem / comment" form.</summary>
[Collection(PostgresCollection.Name)]
public sealed class OpsApiTests(PostgresFixture postgres) : IAsyncLifetime
{
    private readonly ApiFactory _factory = new(postgres);
    private HttpClient _master = null!;

    public async Task InitializeAsync() => _master = await _factory.CreateMasterClientAsync();

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    private async Task<string> CreateTokenAsync() =>
        (await _master.PostAsync("/api/admin/ops-token", null).Read<NewOpsTokenDto>()).Token;

    private HttpClient Console(string token)
    {
        var client = _factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    private async Task<HttpClient> ConsoleAsync() => Console(await CreateTokenAsync());

    [Fact]
    public async Task The_ops_api_needs_the_console_token()
    {
        var token = await CreateTokenAsync();
        var owner = await _factory.CreateAdminClientAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateApiClient().GetAsync("/api/ops/version")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Console(OpsToken.Prefix + "wrong").GetAsync("/api/ops/version")).StatusCode);
        // An admin session is not a console token.
        Assert.Equal(HttpStatusCode.Unauthorized, (await owner.GetAsync("/api/ops/version")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _master.GetAsync("/api/ops/version")).StatusCode);

        var version = await Console(token).GetAsync("/api/ops/version").Read<VersionDto>();
        Assert.Equal(ApiFactory.SiteId, version.SiteId);
        await using (var db = _factory.CreateDbContext())
            Assert.Equal(db.Database.GetMigrations().Last(), version.Migration);
        Assert.Empty(version.PendingMigrations);
    }

    [Fact]
    public async Task The_console_token_never_works_as_an_admin_session()
    {
        var console = await ConsoleAsync();
        Assert.Equal(HttpStatusCode.Unauthorized, (await console.GetAsync("/api/admin/settings")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await console.GetAsync("/api/admin/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await console.GetAsync("/api/account/me")).StatusCode);
    }

    [Fact]
    public async Task Only_the_master_manages_the_token_and_the_site_keeps_only_its_hash()
    {
        var owner = await _factory.CreateAdminClientAsync();
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.PostAsync("/api/admin/ops-token", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.GetAsync("/api/admin/ops-token")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.DeleteAsync("/api/admin/ops-token")).StatusCode);

        Assert.Null((await _master.GetAsync("/api/admin/ops-token").Read<OpsTokenDto>()).CreatedAt);
        var token = await CreateTokenAsync();
        Assert.StartsWith(OpsToken.Prefix, token);
        Assert.NotNull((await _master.GetAsync("/api/admin/ops-token").Read<OpsTokenDto>()).CreatedAt);

        await using var db = _factory.CreateDbContext();
        var settings = await db.Settings.SingleAsync();
        Assert.Equal(OpsToken.Hash(token), settings.OpsTokenHash);
        Assert.DoesNotContain(token, settings.OpsTokenHash);

        // The audit trail records that it changed, never the hash.
        var entry = (await _master.GetAsync("/api/admin/audit").Read<List<AuditEntryDto>>())
            .First(e => e.EntityType == nameof(Settings));
        var change = Assert.Single(entry.Changes, c => c.Field == nameof(Settings.OpsTokenHash));
        Assert.True(change.Secret);
        Assert.Null(change.To);
    }

    [Fact]
    public async Task A_new_token_replaces_the_old_one_and_revoking_turns_the_console_off()
    {
        var first = await CreateTokenAsync();
        var second = await CreateTokenAsync();
        Assert.NotEqual(first, second);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Console(first).GetAsync("/api/ops/version")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Console(second).GetAsync("/api/ops/version")).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await _master.DeleteAsync("/api/admin/ops-token")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Console(second).GetAsync("/api/ops/version")).StatusCode);
        Assert.Null((await _master.GetAsync("/api/admin/ops-token").Read<OpsTokenDto>()).CreatedAt);
    }

    [Fact]
    public async Task The_summary_counts_orders_and_totals_per_period_like_the_reports()
    {
        await using (var db = _factory.CreateDbContext())
        {
            Order Make(DateOnly date, decimal total, OrderStatus status = OrderStatus.New, bool needsReview = false) => new()
            {
                Phone = "0501234567", Name = "דנה", Address = "אשקלון", SupplyDate = date, Total = total,
                Status = status, NeedsReview = needsReview, CreatedAt = DateTimeOffset.UtcNow,
            };
            db.Orders.AddRange(
                Make(new(2030, 1, 6), 100),
                Make(new(2030, 1, 8), 50),
                Make(new(2030, 1, 15), 30),
                Make(new(2030, 2, 3), 70),
                Make(new(2030, 2, 4), 999, OrderStatus.Cancelled),
                Make(new(2030, 2, 5), 999, needsReview: true),
                Make(new(2030, 4, 1), 999));
            await db.SaveChangesAsync();
        }
        var console = await ConsoleAsync();

        var months = await console.GetAsync("/api/ops/summary?from=2030-01-01&to=2030-03-31").Read<SummaryDto>();
        Assert.Equal(4, months.Orders);
        Assert.Equal(250, months.Sales);
        Assert.Equal(
            [new PeriodDto(new(2030, 1, 1), 3, 180), new PeriodDto(new(2030, 2, 1), 1, 70)],
            months.Periods);

        // Weeks start on Sunday: 2030-01-06 is one.
        var weeks = await console.GetAsync("/api/ops/summary?from=2030-01-01&to=2030-01-31&period=week").Read<SummaryDto>();
        Assert.Equal(
            [new PeriodDto(new(2030, 1, 6), 2, 150), new PeriodDto(new(2030, 1, 13), 1, 30)],
            weeks.Periods);

        await (await console.GetAsync("/api/ops/summary?from=2030-02-01&to=2030-01-01")).AssertInvalid("from", "invalidRange");
    }

    [Fact]
    public async Task The_console_lists_recommendations_and_marks_them_handled()
    {
        int id;
        await using (var db = _factory.CreateDbContext())
        {
            var user = new User { Phone = "0501234567", FullName = "דנה כהן", Address = "אשקלון" };
            user.Recommendations.Add(new Recommendation { Text = "הקוסקוס מעולה", CreatedAt = DateTimeOffset.UtcNow });
            db.Users.Add(user);
            await db.SaveChangesAsync();
            id = user.Recommendations[0].Id;
        }
        var console = await ConsoleAsync();

        var open = await console.GetAsync("/api/ops/recommendations?handled=false").Read<List<RecommendationDto>>();
        Assert.Equal("דנה כהן", Assert.Single(open).ClientName);

        Assert.Equal(HttpStatusCode.NoContent,
            (await console.PutAsJsonAsync($"/api/ops/recommendations/{id}", new HandledInput(true))).StatusCode);
        Assert.Empty(await console.GetAsync("/api/ops/recommendations?handled=false").Read<List<RecommendationDto>>());
        Assert.True(Assert.Single(await console.GetAsync("/api/ops/recommendations").Read<List<RecommendationDto>>()).IsHandled);
        Assert.Equal(HttpStatusCode.NotFound,
            (await console.PutAsJsonAsync("/api/ops/recommendations/99999", new HandledInput(true))).StatusCode);

        // The console's changes are audited as the console.
        var entry = (await _master.GetAsync("/api/admin/audit").Read<List<AuditEntryDto>>())
            .First(e => e.EntityType == nameof(Recommendation));
        Assert.Equal(OpsToken.Actor, entry.Actor);
    }

    [Fact]
    public async Task The_admin_reports_a_problem_and_sees_when_the_console_handled_it()
    {
        var owner = await _factory.CreateAdminClientAsync();
        await (await owner.PostAsJsonAsync("/api/admin/feedback", new FeedbackInput(null, " ", null), TestFiles.Json))
            .AssertInvalid("kind", "required");
        await (await owner.PostAsJsonAsync("/api/admin/feedback", new FeedbackInput(FeedbackKind.Problem, "", null), TestFiles.Json))
            .AssertInvalid("text", "required");
        await (await owner.PostAsJsonAsync("/api/admin/feedback",
                new FeedbackInput(FeedbackKind.Comment, new string('א', Feedback.TextMaxLength + 1), null), TestFiles.Json))
            .AssertInvalid("text", "tooLong");

        var sent = await owner.PostAsJsonAsync("/api/admin/feedback",
            new FeedbackInput(FeedbackKind.Problem, "  ההדפסה נחתכת  ", "/admin/orders"), TestFiles.Json).Read<FeedbackDto>();
        Assert.Equal("ההדפסה נחתכת", sent.Text);
        Assert.Equal("owner", sent.Actor);

        var console = await ConsoleAsync();
        var collected = Assert.Single(await console.GetAsync("/api/ops/feedback?handled=false").Read<List<FeedbackDto>>());
        Assert.Equal((sent.Id, FeedbackKind.Problem, "/admin/orders", "owner"), (collected.Id, collected.Kind, collected.Page, collected.Actor));

        Assert.Equal(HttpStatusCode.NoContent,
            (await console.PutAsJsonAsync($"/api/ops/feedback/{sent.Id}", new HandledInput(true))).StatusCode);
        Assert.True(Assert.Single(await owner.GetAsync("/api/admin/feedback").Read<List<FeedbackDto>>()).IsHandled);
        Assert.Empty(await console.GetAsync("/api/ops/feedback?handled=false").Read<List<FeedbackDto>>());
    }

    [Fact]
    public async Task The_console_turns_features_on_and_off_and_back_to_the_site_default()
    {
        var console = await ConsoleAsync();
        var guest = _factory.CreateApiClient();
        async Task<IReadOnlyList<string>> Enabled() => (await guest.GetAsync("/api/site").Read<SiteDto>()).Features;

        var features = await console.GetAsync("/api/ops/features").Read<List<FeatureDto>>();
        Assert.Equal(Features.All, features.Select(f => f.Name));
        Assert.Contains(new FeatureDto(Features.Favorites, true, true, false), features);

        var off = await console.PutAsJsonAsync($"/api/ops/features/{Features.Favorites}", new FeatureInput(false)).Read<FeatureDto>();
        Assert.Equal(new FeatureDto(Features.Favorites, false, true, true), off);
        Assert.DoesNotContain(Features.Favorites, await Enabled());

        var on = await console.PutAsJsonAsync($"/api/ops/features/{Features.AdvancedDishes}", new FeatureInput(true)).Read<FeatureDto>();
        Assert.Equal(new FeatureDto(Features.AdvancedDishes, true, false, true), on);
        Assert.Contains(Features.AdvancedDishes, await Enabled());

        var cleared = await console.PutAsJsonAsync($"/api/ops/features/{Features.Favorites}", new FeatureInput(null)).Read<FeatureDto>();
        Assert.Equal(new FeatureDto(Features.Favorites, true, true, false), cleared);
        Assert.Contains(Features.Favorites, await Enabled());

        Assert.Equal(HttpStatusCode.NotFound,
            (await console.PutAsJsonAsync("/api/ops/features/nope", new FeatureInput(true))).StatusCode);
    }
}
