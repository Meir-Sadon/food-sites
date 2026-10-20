using System.Net.Http.Json;
using FoodSite.Api.Controllers;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Sites;
using Microsoft.Extensions.DependencyInjection;
using static FoodSite.Api.Controllers.Admin.CategoriesController;
using static FoodSite.Api.Controllers.Admin.DishesController;
using static FoodSite.Api.Controllers.Admin.SettingsController;

namespace FoodSite.Api.Tests;

public class ItemBadgesRulesTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 20, 12, 0, 0, TimeSpan.Zero);

    private static ItemBadges.Effective New(bool on, int amount, string unit) => new(on, amount, unit, false, ItemBadges.Percent, 20);

    [Theory]
    [InlineData(ItemBadges.Day, 2, -47, true)]
    [InlineData(ItemBadges.Day, 2, -49, false)]
    [InlineData(ItemBadges.Week, 1, -6 * 24, true)]
    [InlineData(ItemBadges.Week, 1, -8 * 24, false)]
    [InlineData(ItemBadges.Month, 1, -29 * 24, true)]
    [InlineData(ItemBadges.Month, 1, -32 * 24, false)]
    public void A_dish_is_new_until_its_period_ends(string unit, int amount, int hoursAgo, bool expected) =>
        Assert.Equal(expected, ItemBadges.IsNew(New(true, amount, unit), Now.AddHours(hoursAgo), Now));

    [Fact]
    public void Nothing_is_new_while_the_badge_is_off() =>
        Assert.False(ItemBadges.IsNew(New(false, 1, ItemBadges.Week), Now, Now));

    [Theory]
    [InlineData(ItemBadges.Percent, 20, true)]
    [InlineData(ItemBadges.Percent, 100, false)]
    [InlineData(ItemBadges.Percent, 0, false)]
    [InlineData(ItemBadges.Pieces, 500, true)]
    [InlineData(ItemBadges.Pieces, 0, false)]
    public void The_low_stock_amount_is_checked_against_its_mode(string mode, int amount, bool valid) =>
        Assert.Equal(valid, ItemBadges.LowStockAmountValid(mode, amount));
}

[Collection(PostgresCollection.Name)]
public sealed class ItemBadgesTests(PostgresFixture postgres) : IAsyncLifetime
{
    private readonly ApiFactory _factory = new(postgres);
    private HttpClient _admin = null!;

    public async Task InitializeAsync() => _admin = await _factory.CreateAdminClientAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private async Task<DishDto> AddDish(string name, bool? onSale = null, decimal? maxPerSupplyDate = null)
    {
        var category = await (await _admin.PostAsJsonAsync("/api/admin/categories", new { name = "קטגוריה " + name })).Read<CategoryDto>();
        var input = new DishInput(
            name, category.Id, null, null, SellBy.Units, ChoiceMode.Fixed, null, null, null, null, false, false,
            [new OptionInput(null, "מנה", 1, 40, true)], [], MaxPerSupplyDate: maxPerSupplyDate, OnSale: onSale);
        return await (await _admin.PostAsJsonAsync("/api/admin/dishes", input, TestFiles.Json)).Read<DishDto>();
    }

    private async Task<PublicController.MenuDishDto> MenuDish(int id) =>
        (await _factory.CreateClient().GetAsync("/api/menu").Read<PublicController.MenuDto>()).Dishes.Single(d => d.Id == id);

    [Fact]
    public async Task Both_settings_start_off_with_defaults()
    {
        var badges = (await _admin.GetAsync("/api/admin/settings").Read<SettingsDto>()).Badges;
        Assert.Equal(new ItemBadges.Effective(false, 1, "week", false, "percent", 20), badges);
    }

    [Fact]
    public async Task A_dish_is_marked_on_sale_and_an_older_client_keeps_the_mark()
    {
        var dish = await AddDish("מבצע", onSale: true);
        Assert.True(dish.OnSale);
        Assert.True((await MenuDish(dish.Id)).OnSale);

        var kept = dish with { OnSale = false };
        var resend = new DishInput(
            dish.Name, dish.CategoryId, null, null, SellBy.Units, ChoiceMode.Fixed, null, null, null, null, false, false,
            [new OptionInput(dish.Options[0].Id, "מנה", 1, 40, true)], []);
        (await _admin.PutAsJsonAsync($"/api/admin/dishes/{dish.Id}", resend, TestFiles.Json)).EnsureSuccessStatusCode();
        Assert.True((await MenuDish(dish.Id)).OnSale);

        (await _admin.PutAsJsonAsync($"/api/admin/dishes/{dish.Id}", resend with { OnSale = false }, TestFiles.Json)).EnsureSuccessStatusCode();
        Assert.False((await MenuDish(dish.Id)).OnSale);
        Assert.False(kept.OnSale);
    }

    [Fact]
    public async Task A_new_dish_shows_as_new_only_while_the_badge_is_on()
    {
        var dish = await AddDish("חדש");
        Assert.False((await MenuDish(dish.Id)).IsNew);

        var saved = await (await _admin.PutAsJsonAsync("/api/admin/settings/badges",
            new ItemBadges.Input(true, 2, "day", null, null, null))).Read<SettingsDto>();
        Assert.Equal((true, 2, "day"), (saved.Badges.NewEnabled, saved.Badges.NewAmount, saved.Badges.NewUnit));
        Assert.True((await MenuDish(dish.Id)).IsNew);

        var site = await _factory.CreateClient().GetAsync("/api/site").Read<PublicController.SiteDto>();
        Assert.True(site.Badges!.NewEnabled);
    }

    [Fact]
    public async Task A_dish_that_existed_before_the_badge_is_not_new()
    {
        var dish = await AddDish("ישן");
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<Data.AppDbContext>();
            (await db.Dishes.FindAsync(dish.Id))!.CreatedAt = DateTimeOffset.UtcNow.AddDays(-40);
            await db.SaveChangesAsync();
        }
        await _admin.PutAsJsonAsync("/api/admin/settings/badges", new ItemBadges.Input(true, 1, "month", null, null, null));
        Assert.False((await MenuDish(dish.Id)).IsNew);
        await _admin.PutAsJsonAsync("/api/admin/settings/badges", new ItemBadges.Input(true, 2, "month", null, null, null));
        Assert.True((await MenuDish(dish.Id)).IsNew);
    }

    [Fact]
    public async Task The_menu_gives_a_limited_dish_its_limit_for_the_almost_out_mark()
    {
        var limited = await AddDish("מוגבל", maxPerSupplyDate: 10);
        var open = await AddDish("פתוח");
        Assert.Equal(10, (await MenuDish(limited.Id)).Limit);
        Assert.Null((await MenuDish(open.Id)).Limit);
    }

    [Fact]
    public async Task The_low_stock_settings_are_saved_and_checked()
    {
        var saved = await (await _admin.PutAsJsonAsync("/api/admin/settings/badges",
            new ItemBadges.Input(null, null, null, true, "units", 3))).Read<SettingsDto>();
        Assert.Equal((true, "units", 3), (saved.Badges.LowStockEnabled, saved.Badges.LowStockMode, saved.Badges.LowStockAmount));
        Assert.False(saved.Badges.NewEnabled);

        await (await _admin.PutAsJsonAsync("/api/admin/settings/badges", new ItemBadges.Input(null, null, null, null, "percent", 150)))
            .AssertInvalid("LowStockAmount", "invalid");
        await (await _admin.PutAsJsonAsync("/api/admin/settings/badges", new ItemBadges.Input(null, 0, null, null, null, null)))
            .AssertInvalid("NewAmount", "invalid");
        await (await _admin.PutAsJsonAsync("/api/admin/settings/badges", new ItemBadges.Input(null, null, "year", null, null, null)))
            .AssertInvalid("NewUnit", "invalid");
        await (await _admin.PutAsJsonAsync("/api/admin/settings/badges", new ItemBadges.Input(null, null, null, null, "bad", null)))
            .AssertInvalid("LowStockMode", "invalid");
    }
}
