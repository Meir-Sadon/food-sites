using System.Net;
using System.Net.Http.Json;
using FoodSite.Api.Auth;
using FoodSite.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using static FoodSite.Api.Controllers.Admin.AuditController;
using static FoodSite.Api.Controllers.Admin.CategoriesController;
using static FoodSite.Api.Controllers.Admin.ClosedDatesController;
using static FoodSite.Api.Controllers.Admin.DishesController;

namespace FoodSite.Api.Tests;

[Collection(PostgresCollection.Name)]
public sealed class AuditTests(PostgresFixture postgres) : IDisposable
{
    private readonly ApiFactory _factory = new(postgres);

    public void Dispose() => _factory.Dispose();

    private static async Task<List<AuditEntryDto>> Audit(HttpClient admin, string query = "") =>
        await (await admin.GetAsync("/api/admin/audit" + query)).Read<List<AuditEntryDto>>();

    private static async Task<List<AuditEntryDto>> Changes(HttpClient admin) =>
        (await Audit(admin)).Where(e => e.Action != AuditAction.LoggedIn).ToList();

    private static DishInput Dish(string name, int categoryId, int? optionId, decimal price) => new(
        name, categoryId, null, null, SellBy.Units, ChoiceMode.Fixed,
        null, null, null, null, false, false,
        [new OptionInput(optionId, "מנה", 1, price, true)], []);

    [Fact]
    public async Task A_change_is_recorded_with_the_admin_who_made_it()
    {
        var owner = await _factory.CreateAdminClientAsync();
        var master = await _factory.CreateMasterClientAsync();

        var category = await (await owner.PostAsJsonAsync("/api/admin/categories", new { name = "סלטים" })).Read<CategoryDto>();
        Assert.True((await master.PutAsJsonAsync($"/api/admin/categories/{category.Id}", new { name = "סלטים טריים" })).IsSuccessStatusCode);

        var entries = await Changes(owner);
        var renamed = entries[0];
        Assert.Equal(AdminActor.Master, renamed.Actor);
        Assert.Equal(AuditAction.Modified, renamed.Action);
        Assert.Equal(nameof(Category), renamed.EntityType);
        Assert.Equal(category.Id.ToString(), renamed.EntityId);
        Assert.Equal("סלטים טריים", renamed.Label);
        var change = Assert.Single(renamed.Changes);
        Assert.Equal(("Name", "סלטים", "סלטים טריים"), (change.Field, change.From, change.To));

        var added = entries[1];
        Assert.Equal(AdminActor.Owner, added.Actor);
        Assert.Equal(AuditAction.Added, added.Action);
        Assert.Equal(category.Id.ToString(), added.EntityId);
        Assert.Contains(added.Changes, c => c is { Field: "Name", From: null, To: "סלטים" });
    }

    [Fact]
    public async Task A_price_change_shows_the_old_and_new_price_under_the_dish()
    {
        var owner = await _factory.CreateAdminClientAsync();
        var category = await (await owner.PostAsJsonAsync("/api/admin/categories", new { name = "עיקריות" })).Read<CategoryDto>();
        var dish = await (await owner.PostAsJsonAsync("/api/admin/dishes", Dish("קוסקוס", category.Id, null, 40), TestFiles.Json))
            .Read<DishDto>();
        var master = await _factory.CreateMasterClientAsync();

        await (await master.PutAsJsonAsync($"/api/admin/dishes/{dish.Id}",
            Dish("קוסקוס", category.Id, dish.Options[0].Id, 45), TestFiles.Json)).Read<DishDto>();

        var price = Assert.Single(await Changes(owner), e => e.Changes.Any(c => c.Field == "Price" && c.From is not null));
        Assert.Equal(AdminActor.Master, price.Actor);
        Assert.Equal(nameof(DishOption), price.EntityType);
        Assert.Equal("קוסקוס › מנה", price.Label);
        Assert.Contains(price.Changes, c => c is { Field: "Price", From: "40.00", To: "45" } or { Field: "Price", From: "40.00", To: "45.00" });
    }

    [Fact]
    public async Task Order_status_and_removals_are_recorded()
    {
        var owner = await _factory.CreateAdminClientAsync();
        var closed = await (await owner.PostAsJsonAsync("/api/admin/closed-dates",
            new ClosedDateInput(DateOnly.FromDateTime(DateTime.Today.AddDays(30)), "חג"))).Read<ClosedDateDto>();
        Assert.Equal(HttpStatusCode.NoContent, (await owner.DeleteAsync($"/api/admin/closed-dates/{closed.Id}")).StatusCode);

        var removed = (await Changes(owner))[0];
        Assert.Equal(AuditAction.Deleted, removed.Action);
        Assert.Equal(nameof(ClosedDate), removed.EntityType);
        Assert.Equal(closed.Id.ToString(), removed.EntityId);
        Assert.Equal(closed.Date.ToString("yyyy-MM-dd"), removed.Label);
    }

    [Fact]
    public async Task A_password_change_is_recorded_without_the_hash()
    {
        var owner = await _factory.CreateAdminClientAsync();
        Assert.Equal(HttpStatusCode.NoContent, (await owner.PutAsJsonAsync("/api/admin/password",
            new { currentPassword = ApiFactory.AdminPassword, newPassword = "brand-new-password" })).StatusCode);

        var entry = (await Changes(owner))[0];
        Assert.Equal(AdminActor.Owner, entry.Actor);
        Assert.Equal(nameof(Settings), entry.EntityType);
        var change = Assert.Single(entry.Changes);
        Assert.Equal(new("AdminPasswordHash", null, null, true), change);

        await using var db = _factory.CreateDbContext();
        var stored = await db.AuditEntries.Select(a => a.Changes).ToListAsync();
        var hash = await db.Settings.Select(s => s.AdminPasswordHash).SingleAsync();
        Assert.DoesNotContain(stored, c => c != null && c.Contains(hash!));
    }

    [Fact]
    public async Task Logins_are_recorded()
    {
        var owner = await _factory.CreateAdminClientAsync();
        await _factory.CreateMasterClientAsync();

        var logins = (await Audit(owner)).Where(e => e.Action == AuditAction.LoggedIn).Select(e => e.Actor).ToList();
        Assert.Equal([AdminActor.Master, AdminActor.Owner], logins);
    }

    [Fact]
    public async Task Changes_outside_the_admin_api_are_not_recorded()
    {
        var owner = await _factory.CreateAdminClientAsync();
        // The admin's browser sends its session cookie to the whole API; a client-side save is still not audited.
        Assert.Equal(HttpStatusCode.OK, (await owner.GetAsync("/api/site")).StatusCode);
        await using (var db = _factory.CreateDbContext())
        {
            db.Categories.Add(new Category { Name = "נוסף מחוץ לאדמין" });
            await db.SaveChangesAsync();
        }

        Assert.Empty(await Changes(owner));
    }

    [Fact]
    public async Task Pages_go_back_in_time()
    {
        var owner = await _factory.CreateAdminClientAsync();
        for (var i = 0; i < 5; i++)
            await (await owner.PostAsJsonAsync("/api/admin/categories", new { name = $"קטגוריה {i}" })).Read<CategoryDto>();

        var first = await Audit(owner, "?limit=2");
        var second = await Audit(owner, $"?limit=2&before={first[^1].Id}");

        Assert.Equal(["קטגוריה 4", "קטגוריה 3"], first.Select(e => e.Label));
        Assert.Equal(["קטגוריה 2", "קטגוריה 1"], second.Select(e => e.Label));
    }

    [Fact]
    public async Task The_trail_is_for_admins_only_and_cannot_be_edited()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateApiClient().GetAsync("/api/admin/audit")).StatusCode);

        var owner = await _factory.CreateAdminClientAsync();
        var id = (await Audit(owner))[0].Id;
        Assert.Equal(HttpStatusCode.MethodNotAllowed, (await owner.DeleteAsync("/api/admin/audit")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.DeleteAsync($"/api/admin/audit/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.MethodNotAllowed, (await owner.PutAsJsonAsync("/api/admin/audit", new { })).StatusCode);
        Assert.Single(await Audit(owner));
    }
}
