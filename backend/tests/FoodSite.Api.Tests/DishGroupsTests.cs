using System.Net;
using System.Net.Http.Json;
using FoodSite.Api.Data.Entities;
using static FoodSite.Api.Controllers.Admin.CategoriesController;
using static FoodSite.Api.Controllers.Admin.DishGroupsController;
using static FoodSite.Api.Controllers.Admin.DishesController;

namespace FoodSite.Api.Tests;

[Collection(PostgresCollection.Name)]
public sealed class DishGroupsTests(PostgresFixture postgres) : IAsyncLifetime
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

    private Task<HttpResponseMessage> CreateDish(string name, int categoryId, bool addOnOnly = false) =>
        _admin.PostAsJsonAsync("/api/admin/dishes", new DishInput(
            name, categoryId, null, null, SellBy.Units, ChoiceMode.Fixed, null, null, null, null, addOnOnly, false,
            [new OptionInput(null, "מנה", 1, 40, true)], []), TestFiles.Json);

    private async Task<DishDto> Dish(string name, int categoryId) => await (await CreateDish(name, categoryId)).Read<DishDto>();

    private async Task<DishGroupDto> AddGroup(string name, params int[] dishIds) =>
        await (await _admin.PostAsJsonAsync("/api/admin/dish-groups", new DishGroupInput(name, [.. dishIds]))).Read<DishGroupDto>();

    private async Task<List<DishGroupDto>> Groups() => await (await _admin.GetAsync("/api/admin/dish-groups")).Read<List<DishGroupDto>>();

    [Fact]
    public async Task Groups_hold_dishes_from_several_categories_and_a_dish_can_be_in_several_groups()
    {
        var meat = await AddCategory("בשרים");
        var salads = await AddCategory("סלטים");
        var kebab = await Dish("קבב", meat.Id);
        var salad = await Dish("סלט", salads.Id);

        var picks = await AddGroup(" מומלצות ", kebab.Id, salad.Id);
        var sale = await AddGroup("מנות במבצע", salad.Id);

        Assert.Equal(("מומלצות", 0), (picks.Name, picks.DisplayOrder));
        Assert.Equal(1, sale.DisplayOrder);
        var all = await Groups();
        Assert.Equal([kebab.Id, salad.Id], all[0].DishIds);
        Assert.Equal([salad.Id], all[1].DishIds);

        var menu = await (await _admin.GetAsync("/api/menu")).Read<FoodSite.Api.Controllers.PublicController.MenuDto>();
        Assert.Equal(["מומלצות", "מנות במבצע"], menu.Groups!.Select(g => g.Name));
        Assert.Equal([kebab.Id, salad.Id], menu.Groups![0].DishIds);
    }

    [Fact]
    public async Task A_group_is_renamed_reselected_moved_and_removed()
    {
        var category = await AddCategory("בשרים");
        var a = await Dish("א", category.Id);
        var b = await Dish("ב", category.Id);
        var first = await AddGroup("ראשונה", a.Id);
        var second = await AddGroup("שנייה");

        (await _admin.PutAsJsonAsync($"/api/admin/dish-groups/{first.Id}", new DishGroupInput("חדשה", [b.Id]))).EnsureSuccessStatusCode();
        var moved = await (await _admin.PostAsJsonAsync($"/api/admin/dish-groups/{second.Id}/move", new { direction = "Up" })).Read<List<DishGroupDto>>();
        Assert.Equal(["שנייה", "חדשה"], moved.Select(g => g.Name));
        Assert.Equal([b.Id], moved[1].DishIds);

        Assert.Equal(HttpStatusCode.NoContent, (await _admin.DeleteAsync($"/api/admin/dish-groups/{first.Id}")).StatusCode);
        Assert.Equal(["שנייה"], (await Groups()).Select(g => g.Name));
    }

    [Fact]
    public async Task Menu_leaves_out_empty_groups_and_dishes_that_are_gone()
    {
        var category = await AddCategory("בשרים");
        var gone = await Dish("ישן", category.Id);
        await AddGroup("ריקה");
        await AddGroup("אחרונה", gone.Id);

        Assert.DoesNotContain((await (await _admin.GetAsync("/api/menu")).Read<FoodSite.Api.Controllers.PublicController.MenuDto>()).Groups!, g => g.Name == "ריקה");

        (await _admin.DeleteAsync($"/api/admin/dishes/{gone.Id}")).EnsureSuccessStatusCode();
        var menu = await (await _admin.GetAsync("/api/menu")).Read<FoodSite.Api.Controllers.PublicController.MenuDto>();
        Assert.Empty(menu.Groups!);
        Assert.All(await Groups(), g => Assert.Empty(g.DishIds));
    }

    [Fact]
    public async Task Group_name_is_required_unique_and_only_orderable_dishes_are_accepted()
    {
        var category = await AddCategory("בשרים");
        var dish = await Dish("קבב", category.Id);
        var addOn = await (await CreateDish("תוספת", category.Id, addOnOnly: true)).Read<DishDto>();
        await AddGroup("מומלצות", dish.Id);

        await (await _admin.PostAsJsonAsync("/api/admin/dish-groups", new DishGroupInput("  ", []))).AssertInvalid("name", "required");
        await (await _admin.PostAsJsonAsync("/api/admin/dish-groups", new DishGroupInput("מומלצות", []))).AssertInvalid("name", "duplicate");
        await (await _admin.PostAsJsonAsync("/api/admin/dish-groups", new DishGroupInput("אחרת", [addOn.Id]))).AssertInvalid("dishIds", "dishNotGroupable");
        await (await _admin.PostAsJsonAsync("/api/admin/dish-groups", new DishGroupInput("אחרת", [9999]))).AssertInvalid("dishIds", "dishNotGroupable");
    }
}
