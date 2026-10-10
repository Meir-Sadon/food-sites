using System.Net;
using System.Net.Http.Json;
using FoodSite.Api.Data.Entities;
using static FoodSite.Api.Controllers.Admin.CategoriesController;
using static FoodSite.Api.Controllers.Admin.DishesController;

namespace FoodSite.Api.Tests;

[Collection(PostgresCollection.Name)]
public sealed class CatalogAdminTests(PostgresFixture postgres) : IAsyncLifetime
{
    private readonly ApiFactory _factory = new(postgres);
    private HttpClient _admin = null!;

    public async Task InitializeAsync() => _admin = await _factory.CreateAdminClientAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private async Task<CategoryDto> AddCategory(string name) =>
        await (await _admin.PostAsJsonAsync("/api/admin/categories", new { name })).Read<CategoryDto>();

    private async Task<List<CategoryDto>> Categories() =>
        await (await _admin.GetAsync("/api/admin/categories")).Read<List<CategoryDto>>();

    private static DishInput Fixed(string name, int categoryId, params OptionInput[] options) => new(
        name, categoryId, "תיאור קצר", null, SellBy.Units, ChoiceMode.Fixed,
        null, null, null, null, false, false,
        options.Length > 0 ? [.. options] : [new OptionInput(null, "מנה", 1, 40, true)], []);

    private static DishInput FreeWeight(string name, int categoryId) => new(
        name, categoryId, null, "גלוטן", SellBy.Weight, ChoiceMode.Free,
        0.5m, 3m, 0.25m, 90m, false, false, null, []);

    private Task<HttpResponseMessage> Create(DishInput input) => _admin.PostAsJsonAsync("/api/admin/dishes", input, TestFiles.Json);

    private Task<HttpResponseMessage> Update(int id, DishInput input) => _admin.PutAsJsonAsync($"/api/admin/dishes/{id}", input, TestFiles.Json);

    private async Task<DishDto> CreateOk(DishInput input) => await (await Create(input)).Read<DishDto>();

    private async Task<DishDto> GetDish(int id) => await (await _admin.GetAsync($"/api/admin/dishes/{id}")).Read<DishDto>();

    // ---------- Categories ----------

    [Fact]
    public async Task Categories_are_added_at_the_end_and_renamed()
    {
        var meat = await AddCategory(" בשרים ");
        var sides = await AddCategory("תוספות");
        Assert.Equal(("בשרים", 0), (meat.Name, meat.DisplayOrder));
        Assert.Equal(1, sides.DisplayOrder);

        var rename = await _admin.PutAsJsonAsync($"/api/admin/categories/{sides.Id}", new { name = "סלטים" });
        Assert.Equal(HttpStatusCode.NoContent, rename.StatusCode);
        Assert.Equal(["בשרים", "סלטים"], (await Categories()).Select(c => c.Name));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Category_name_is_required(string name)
    {
        var response = await _admin.PostAsJsonAsync("/api/admin/categories", new { name });
        await response.AssertInvalid("name", "required");
    }

    [Fact]
    public async Task Category_names_are_unique()
    {
        await AddCategory("דגים");
        var response = await _admin.PostAsJsonAsync("/api/admin/categories", new { name = "דגים" });
        await response.AssertInvalid("name", "duplicate");
    }

    [Fact]
    public async Task Categories_move_up_and_down()
    {
        var a = await AddCategory("א");
        await AddCategory("ב");
        var c = await AddCategory("ג");

        var moved = await (await _admin.PostAsJsonAsync($"/api/admin/categories/{c.Id}/move", new { direction = "Up" })).Read<List<CategoryDto>>();
        Assert.Equal(["א", "ג", "ב"], moved.Select(x => x.Name));
        Assert.Equal([0, 1, 2], moved.Select(x => x.DisplayOrder));

        // Moving past either end changes nothing.
        moved = await (await _admin.PostAsJsonAsync($"/api/admin/categories/{a.Id}/move", new { direction = "Up" })).Read<List<CategoryDto>>();
        Assert.Equal(["א", "ג", "ב"], moved.Select(x => x.Name));
        moved = await (await _admin.PostAsJsonAsync($"/api/admin/categories/{a.Id}/move", new { direction = "Down" })).Read<List<CategoryDto>>();
        Assert.Equal(["ג", "א", "ב"], moved.Select(x => x.Name));
    }

    [Fact]
    public async Task A_category_with_dishes_cannot_be_removed()
    {
        var category = await AddCategory("עופות");
        await CreateOk(Fixed("שניצל", category.Id));

        var response = await _admin.DeleteAsync($"/api/admin/categories/{category.Id}");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("categoryNotEmpty", await response.Content.ReadAsStringAsync());
        Assert.Equal(1, Assert.Single(await Categories()).DishCount);
    }

    [Fact]
    public async Task An_empty_category_is_deleted()
    {
        var category = await AddCategory("ריקה");
        Assert.Equal(HttpStatusCode.NoContent, (await _admin.DeleteAsync($"/api/admin/categories/{category.Id}")).StatusCode);
        Assert.Empty(await Categories());

        await using var db = _factory.CreateDbContext();
        Assert.Empty(db.Categories);
    }

    [Fact]
    public async Task A_category_holding_only_removed_dishes_is_hidden_and_comes_back_with_its_dish()
    {
        var category = await AddCategory("קינוחים");
        var dish = await CreateOk(Fixed("עוגה", category.Id));
        await _admin.DeleteAsync($"/api/admin/dishes/{dish.Id}");

        Assert.Equal(HttpStatusCode.NoContent, (await _admin.DeleteAsync($"/api/admin/categories/{category.Id}")).StatusCode);
        Assert.Empty(await Categories());

        var restored = await (await _admin.PostAsync($"/api/admin/dishes/{dish.Id}/restore", null)).Read<DishDto>();
        Assert.False(restored.IsHidden);
        Assert.Equal("קינוחים", Assert.Single(await Categories()).Name);
    }

    // ---------- Dishes ----------

    [Fact]
    public async Task A_single_option_becomes_the_default()
    {
        var category = await AddCategory("עיקריות");
        var dish = await CreateOk(Fixed("קוסקוס", category.Id, new OptionInput(null, "1 ק\"ג", 1, 60, false)));

        var option = Assert.Single(dish.Options);
        Assert.True(option.IsDefault);
        Assert.Equal(60m, option.Price);
        Assert.Equal("תיאור קצר", dish.Description);
    }

    [Fact]
    public async Task Several_options_need_exactly_one_default()
    {
        var category = await AddCategory("עיקריות");
        var none = Fixed("קוסקוס", category.Id, new OptionInput(null, "חצי", 0.5m, 35, false), new OptionInput(null, "קילו", 1, 60, false));
        await (await Create(none)).AssertInvalid("Options", "oneDefault");

        var two = Fixed("קוסקוס", category.Id, new OptionInput(null, "חצי", 0.5m, 35, true), new OptionInput(null, "קילו", 1, 60, true));
        await (await Create(two)).AssertInvalid("Options", "oneDefault");
    }

    [Fact]
    public async Task Fixed_choice_needs_options_with_positive_amount_and_price()
    {
        var category = await AddCategory("עיקריות");
        await (await Create(Fixed("x", category.Id) with { Options = [] })).AssertInvalid("Options", "optionsRequired");

        var bad = Fixed("x", category.Id, new OptionInput(null, "", 0, -5, true));
        var response = await Create(bad);
        await response.AssertInvalid("options[0].label", "required");
        await (await Create(bad)).AssertInvalid("options[0].amount", "positive");
        await (await Create(bad)).AssertInvalid("options[0].price", "positive");
    }

    [Fact]
    public async Task Free_choice_by_weight_saves_range_step_and_price()
    {
        var category = await AddCategory("סלטים");
        var dish = await CreateOk(FreeWeight("חציל", category.Id));

        Assert.Equal((0.5m, 3m, 0.25m, 90m), (dish.MinAmount, dish.MaxAmount, dish.AmountStep, dish.UnitPrice));
        Assert.Empty(dish.Options);
        Assert.Equal(SellBy.Weight, dish.SellBy);
    }

    [Fact]
    public async Task Free_choice_unit_name_is_saved_trimmed_and_dropped_for_set_options()
    {
        var category = await AddCategory("עלי גפן");
        var dish = await CreateOk(FreeWeight("עלי גפן", category.Id) with { SellBy = SellBy.Units, MinAmount = 1, AmountStep = 1, UnitName = " מגש של 50 " });
        Assert.Equal("מגש של 50", dish.UnitName);

        var menu = await (await _admin.GetAsync("/api/menu")).Read<FoodSite.Api.Controllers.PublicController.MenuDto>();
        Assert.Equal("מגש של 50", menu.Dishes.Single(d => d.Id == dish.Id).UnitName);

        (await Update(dish.Id, Fixed("עלי גפן", category.Id) with { UnitName = "מגש" })).EnsureSuccessStatusCode();
        Assert.Null((await GetDish(dish.Id)).UnitName);

        await (await Create(FreeWeight("חציל", category.Id) with { UnitName = new string('א', 31) })).AssertInvalid("UnitName", "tooLong");
    }

    [Fact]
    public async Task Free_choice_validates_its_range()
    {
        var category = await AddCategory("סלטים");
        var input = FreeWeight("חציל", category.Id);

        await (await Create(input with { MaxAmount = 0.25m })).AssertInvalid("MaxAmount", "belowMin");
        await (await Create(input with { AmountStep = null })).AssertInvalid("AmountStep", "required");
        await (await Create(input with { UnitPrice = 0 })).AssertInvalid("UnitPrice", "positive");
        await (await Create(input with { SellBy = SellBy.Units })).AssertInvalid("MinAmount", "wholeNumber");
    }

    [Fact]
    public async Task Dish_fields_are_checked()
    {
        var category = await AddCategory("עיקריות");
        await (await Create(Fixed(" ", category.Id))).AssertInvalid("Name", "required");
        await (await Create(Fixed("x", category.Id) with { Description = new string('א', 255) })).AssertInvalid("Description", "tooLong");
        await (await Create(Fixed("x", category.Id + 999))).AssertInvalid("CategoryId", "notFound");

        var ok = await CreateOk(Fixed("x", category.Id) with { Description = new string('א', 254) });
        Assert.Equal(254, ok.Description!.Length);
    }

    [Fact]
    public async Task Ticking_parents_on_a_dish_makes_it_their_add_on()
    {
        var category = await AddCategory("עופות");
        var a = await CreateOk(Fixed("עוף שלם", category.Id));
        var b = await CreateOk(Fixed("חצי עוף", category.Id));

        var leg = await CreateOk(Fixed("שוק", category.Id, new OptionInput(null, "יחידה", 1, 10, true)) with
        {
            IsAddOnOnly = true,
            ParentDishIds = [a.Id, b.Id],
        });

        Assert.Equal([a.Id, b.Id], leg.ParentDishIds);
        Assert.Equal([leg.Id], (await GetDish(a.Id)).AddOnDishIds);
        Assert.Equal([leg.Id], (await GetDish(b.Id)).AddOnDishIds);

        var input = Fixed("שוק", category.Id, new OptionInput(leg.Options[0].Id, "יחידה", 1, 10, true)) with
        {
            IsAddOnOnly = true,
            ParentDishIds = [a.Id],
        };
        var updated = await (await Update(leg.Id, input)).Read<DishDto>();
        Assert.Equal([a.Id], updated.ParentDishIds);
        Assert.Empty((await GetDish(b.Id)).AddOnDishIds);
    }

    [Fact]
    public async Task Add_on_links_are_checked()
    {
        var category = await AddCategory("עופות");
        var main = await CreateOk(Fixed("עוף", category.Id));
        var addOnOnly = await CreateOk(Fixed("רוטב", category.Id) with { IsAddOnOnly = true, ParentDishIds = [main.Id] });

        await (await Update(main.Id, Fixed("עוף", category.Id) with { ParentDishIds = [main.Id] })).AssertInvalid("ParentDishIds", "self");
        await (await Create(Fixed("x", category.Id) with { ParentDishIds = [9999] })).AssertInvalid("ParentDishIds", "notFound");
        await (await Create(Fixed("x", category.Id) with { ParentDishIds = [addOnOnly.Id] })).AssertInvalid("ParentDishIds", "parentIsAddOnOnly");
        // A dish that has add-ons under it cannot become add-on only.
        await (await Update(main.Id, Fixed("עוף", category.Id) with { IsAddOnOnly = true })).AssertInvalid("IsAddOnOnly", "hasAddOns");
    }

    [Fact]
    public async Task Editing_options_keeps_their_ids()
    {
        var category = await AddCategory("עיקריות");
        var dish = await CreateOk(Fixed("קוסקוס", category.Id,
            new OptionInput(null, "חצי", 0.5m, 35, true), new OptionInput(null, "קילו", 1, 60, false)));
        var (half, kilo) = (dish.Options[0], dish.Options[1]);

        var input = Fixed("קוסקוס", category.Id,
            new OptionInput(kilo.Id, "קילו", 1, 65, true),
            new OptionInput(null, "2 קילו", 2, 120, false));
        var updated = await (await Update(dish.Id, input)).Read<DishDto>();

        Assert.DoesNotContain(updated.Options, o => o.Id == half.Id);
        var keptKilo = Assert.Single(updated.Options, o => o.Id == kilo.Id);
        Assert.Equal((65m, true), (keptKilo.Price, keptKilo.IsDefault));
        Assert.Contains(updated.Options, o => o.Label == "2 קילו" && !o.IsDefault);
    }

    [Fact]
    public async Task Switching_to_free_choice_drops_options_and_back()
    {
        var category = await AddCategory("עיקריות");
        var dish = await CreateOk(Fixed("קציצות", category.Id));

        var free = await (await Update(dish.Id, FreeWeight("קציצות", category.Id))).Read<DishDto>();
        Assert.Empty(free.Options);
        Assert.Equal(90m, free.UnitPrice);

        var back = await (await Update(dish.Id, Fixed("קציצות", category.Id))).Read<DishDto>();
        Assert.Single(back.Options);
        Assert.Null(back.UnitPrice);
        Assert.Null(back.AmountStep);
    }

    [Fact]
    public async Task Sold_out_toggle_remove_and_restore()
    {
        var category = await AddCategory("עיקריות");
        var dish = await CreateOk(Fixed("מפרום", category.Id));

        await _admin.PutAsJsonAsync($"/api/admin/dishes/{dish.Id}/sold-out", new { isSoldOut = true });
        Assert.True((await GetDish(dish.Id)).IsSoldOut);

        Assert.Equal(HttpStatusCode.NoContent, (await _admin.DeleteAsync($"/api/admin/dishes/{dish.Id}")).StatusCode);
        var all = await (await _admin.GetAsync("/api/admin/dishes")).Read<List<DishDto>>();
        Assert.True(Assert.Single(all).IsHidden);
        Assert.Equal(0, Assert.Single(await Categories()).DishCount);

        await using (var db = _factory.CreateDbContext())
            Assert.Single(db.Dishes); // hidden, not deleted

        Assert.False((await (await _admin.PostAsync($"/api/admin/dishes/{dish.Id}/restore", null)).Read<DishDto>()).IsHidden);
    }

    [Fact]
    public async Task Missing_dishes_answer_not_found()
    {
        Assert.Equal(HttpStatusCode.NotFound, (await _admin.GetAsync("/api/admin/dishes/9999")).StatusCode);
        var category = await AddCategory("x");
        Assert.Equal(HttpStatusCode.NotFound, (await Update(9999, Fixed("x", category.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _admin.DeleteAsync("/api/admin/dishes/9999")).StatusCode);
    }

    // ---------- Pictures ----------

    [Fact]
    public async Task Dish_pictures_upload_reorder_and_delete()
    {
        var category = await AddCategory("עיקריות");
        var dish = await CreateOk(Fixed("קוסקוס", category.Id));
        string url = "/api/admin/dishes/" + dish.Id + "/images";

        await (await _admin.PostAsync(url, TestFiles.Upload(TestFiles.Jpeg))).Read<DishDto>();
        await (await _admin.PostAsync(url, TestFiles.Upload(TestFiles.Png, "b.png", "image/png"))).Read<DishDto>();
        var three = await (await _admin.PostAsync(url, TestFiles.Upload(TestFiles.Webp, "c.webp", "image/webp"))).Read<DishDto>();
        Assert.Equal([0, 1, 2], three.Images.Select(i => i.DisplayOrder));
        Assert.All(_factory.Images.Uploads, u => Assert.Equal(ApiFactory.SiteId + "/dishes", u.Folder));

        var last = three.Images[2];
        var reordered = new[] { three.Images[0].Id, last.Id, three.Images[1].Id };
        var moved = await (await _admin.PutAsJsonAsync($"{url}/order", new { imageIds = reordered })).Read<DishDto>();
        Assert.Equal(reordered, moved.Images.Select(i => i.Id));
        Assert.Equal([0, 1, 2], moved.Images.Select(i => i.DisplayOrder));

        // A list that misses an image, or names one twice, is refused.
        var stale = await _admin.PutAsJsonAsync($"{url}/order", new { imageIds = new[] { last.Id, last.Id, three.Images[1].Id } });
        await AssertListChanged(stale);

        var first = moved.Images[0];
        var afterDelete = await (await _admin.DeleteAsync($"{url}/{first.Id}")).Read<DishDto>();
        Assert.Equal([0, 1], afterDelete.Images.Select(i => i.DisplayOrder));
        Assert.Equal(last.Id, afterDelete.Images[0].Id);
        Assert.Single(_factory.Images.Deleted);
    }

    // ---------- Dish order ----------

    private static async Task AssertListChanged(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("listChanged", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Dishes_are_ordered_within_their_category_and_the_menu_follows()
    {
        var mains = await AddCategory("עיקריות");
        var sides = await AddCategory("תוספות");
        var a = await CreateOk(Fixed("א", mains.Id));
        var b = await CreateOk(Fixed("ב", mains.Id));
        var c = await CreateOk(Fixed("ג", mains.Id));
        var side = await CreateOk(Fixed("פיתה", sides.Id));
        Assert.Equal([0, 1, 2, 0], new[] { a, b, c, side }.Select(d => d.DisplayOrder));

        var all = await (await _admin.PutAsJsonAsync("/api/admin/dishes/order", new { categoryId = mains.Id, dishIds = new[] { c.Id, a.Id, b.Id } }))
            .Read<List<DishDto>>();
        Assert.Equal([c.Id, a.Id, b.Id], all.Where(d => d.CategoryId == mains.Id).Select(d => d.Id));

        var menu = await (await _admin.GetAsync("/api/menu")).Read<FoodSite.Api.Controllers.PublicController.MenuDto>();
        Assert.Equal([c.Id, a.Id, b.Id, side.Id], menu.Dishes.Select(d => d.Id));

        // A new dish, one moved in from another category and a restored one each go last.
        var d = await CreateOk(Fixed("ד", mains.Id));
        Assert.Equal(3, d.DisplayOrder);
        var moved = await (await Update(side.Id, Fixed("פיתה", mains.Id))).Read<DishDto>();
        Assert.Equal(4, moved.DisplayOrder);
        await _admin.DeleteAsync($"/api/admin/dishes/{c.Id}");
        var restored = await (await _admin.PostAsync($"/api/admin/dishes/{c.Id}/restore", null)).Read<DishDto>();
        Assert.Equal(5, restored.DisplayOrder);
    }

    [Fact]
    public async Task A_dish_order_must_list_the_category_s_current_dishes()
    {
        var mains = await AddCategory("עיקריות");
        var a = await CreateOk(Fixed("א", mains.Id));
        var b = await CreateOk(Fixed("ב", mains.Id));
        var removed = await CreateOk(Fixed("ג", mains.Id));
        await _admin.DeleteAsync($"/api/admin/dishes/{removed.Id}");

        var missing = await _admin.PutAsJsonAsync("/api/admin/dishes/order", new { categoryId = mains.Id, dishIds = new[] { b.Id } });
        await AssertListChanged(missing);
        var withRemoved = await _admin.PutAsJsonAsync("/api/admin/dishes/order", new { categoryId = mains.Id, dishIds = new[] { b.Id, a.Id, removed.Id } });
        await AssertListChanged(withRemoved);

        // Removed dishes stay after the ones on the site.
        var all = await (await _admin.PutAsJsonAsync("/api/admin/dishes/order", new { categoryId = mains.Id, dishIds = new[] { b.Id, a.Id } }))
            .Read<List<DishDto>>();
        Assert.Equal([(b.Id, 0), (a.Id, 1), (removed.Id, 2)], all.Select(d => (d.Id, d.DisplayOrder)));
    }

    [Fact]
    public async Task A_dish_has_at_most_six_pictures()
    {
        var category = await AddCategory("עיקריות");
        var dish = await CreateOk(Fixed("קוסקוס", category.Id));
        string url = "/api/admin/dishes/" + dish.Id + "/images";

        for (var i = 0; i < Dish.MaxImages; i++)
            await (await _admin.PostAsync(url, TestFiles.Upload(TestFiles.Jpeg))).Read<DishDto>();

        await (await _admin.PostAsync(url, TestFiles.Upload(TestFiles.Jpeg))).AssertInvalid("file", "tooManyImages");
        Assert.Equal(Dish.MaxImages, _factory.Images.Uploads.Count);
    }
}
