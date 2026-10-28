using System.Net.Http.Json;
using FoodSite.Api.Controllers;
using FoodSite.Api.Data.Entities;
using static FoodSite.Api.Controllers.Admin.CategoriesController;
using static FoodSite.Api.Controllers.Admin.DishesController;

namespace FoodSite.Api.Tests;

[Collection(PostgresCollection.Name)]
public sealed class PriceBeforeDiscountTests(PostgresFixture postgres) : IAsyncLifetime
{
    private readonly ApiFactory _factory = new(postgres);
    private HttpClient _admin = null!;
    private int _categoryId;

    public async Task InitializeAsync()
    {
        _admin = await _factory.CreateAdminClientAsync();
        _categoryId = (await (await _admin.PostAsJsonAsync("/api/admin/categories", new { name = "מבצעים" })).Read<CategoryDto>()).Id;
    }

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private DishInput Fixed(string name, decimal? before) => new(
        name, _categoryId, null, null, SellBy.Units, ChoiceMode.Fixed, null, null, null, null, false, false,
        [new OptionInput(null, "קטנה", 1, 40, true), new OptionInput(null, "גדולה", 2, 70, false)], [],
        PriceBeforeDiscount: before);

    private Task<HttpResponseMessage> Create(DishInput input) => _admin.PostAsJsonAsync("/api/admin/dishes", input, TestFiles.Json);

    private async Task<PublicController.MenuDishDto> MenuDish(int id) =>
        (await _factory.CreateClient().GetAsync("/api/menu").Read<PublicController.MenuDto>()).Dishes.Single(d => d.Id == id);

    [Fact]
    public async Task The_price_before_a_discount_is_saved_shown_on_the_menu_and_cleared()
    {
        var dish = await (await Create(Fixed("שקשוקה", 50))).Read<DishDto>();
        Assert.Equal(50, dish.PriceBeforeDiscount);
        Assert.Equal(50, (await MenuDish(dish.Id)).PriceBeforeDiscount);

        var options = dish.Options.Select(o => new OptionInput(o.Id, o.Label, o.Amount, o.Price, o.IsDefault)).ToList();
        (await _admin.PutAsJsonAsync($"/api/admin/dishes/{dish.Id}", Fixed("שקשוקה", null) with { Options = options }, TestFiles.Json))
            .EnsureSuccessStatusCode();
        Assert.Null((await MenuDish(dish.Id)).PriceBeforeDiscount);
    }

    [Fact]
    public async Task It_must_be_above_the_default_price()
    {
        await (await Create(Fixed("שווה", 40))).AssertInvalid("PriceBeforeDiscount", "notAbovePrice");
        await (await Create(Fixed("שלילי", -5))).AssertInvalid("PriceBeforeDiscount", "invalid");

        var free = new DishInput(
            "סלט", _categoryId, null, null, SellBy.Weight, ChoiceMode.Free, 0.25m, 2, 0.25m, 60, false, false, null, [],
            PriceBeforeDiscount: 55);
        await (await Create(free)).AssertInvalid("PriceBeforeDiscount", "notAbovePrice");
        Assert.Equal(80, (await (await Create(free with { PriceBeforeDiscount = 80 })).Read<DishDto>()).PriceBeforeDiscount);
    }

    [Fact]
    public async Task A_variant_priced_like_its_main_dish_shows_the_main_dishs()
    {
        var main = await (await Create(Fixed("קוסקוס", 55))).Read<DishDto>();
        var variant = new DishInput(
            "קוסקוס צמחוני", _categoryId, null, null, SellBy.Units, ChoiceMode.Fixed, null, null, null, null, false, false, null, [],
            MainDishId: main.Id, UseMainDishPrice: true, PriceBeforeDiscount: 99);
        var saved = await (await Create(variant)).Read<DishDto>();
        Assert.Null(saved.PriceBeforeDiscount);
        Assert.Equal(55, (await MenuDish(saved.Id)).PriceBeforeDiscount);
    }
}
