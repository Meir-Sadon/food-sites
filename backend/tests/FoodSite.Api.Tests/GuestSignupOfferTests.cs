using System.Net.Http.Json;
using FoodSite.Api.Data.Entities;
using static FoodSite.Api.Controllers.Admin.CategoriesController;
using static FoodSite.Api.Controllers.Admin.DishesController;
using static FoodSite.Api.Controllers.Admin.PriceListsController;
using static FoodSite.Api.Controllers.PublicController;

namespace FoodSite.Api.Tests;

/// <summary>The offer made to a guest who presses "send": sign up for the prices a new client gets.</summary>
[Collection(PostgresCollection.Name)]
public sealed class GuestSignupOfferTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string Lists = "/api/admin/price-lists";

    private readonly ApiFactory _factory = new(postgres, new Dictionary<string, string?> { ["Site:Features:guestSignupOffer"] = "true" });
    private HttpClient _admin = null!;
    private int _chicken;

    public async Task InitializeAsync()
    {
        _admin = await _factory.CreateAdminClientAsync();
        var category = await (await _admin.PostAsJsonAsync("/api/admin/categories", new { name = "עופות" })).Read<CategoryDto>();
        _chicken = (await (await _admin.PostAsJsonAsync("/api/admin/dishes", new DishInput(
            "עוף בתנור", category.Id, null, null, SellBy.Units, ChoiceMode.Fixed, null, null, null, null, false, false,
            [new OptionInput(null, "שלם", 1, 70, true)], []), TestFiles.Json)).Read<DishDto>()).Id;
    }

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private async Task<PriceListDto> ListFor(decimal price, StatusesDto statuses)
    {
        var list = await _admin.PostAsJsonAsync(Lists, new PriceListInput("חדשים", null), TestFiles.Json).Read<PriceListDto>();
        (await _admin.PutAsJsonAsync($"{Lists}/{list.Id}/dishes", new DishesInput([new PriceListDishInput(_chicken, 70, price, null, null)]),
            TestFiles.Json)).EnsureSuccessStatusCode();
        return await _admin.PutAsJsonAsync($"{Lists}/{list.Id}/statuses", statuses, TestFiles.Json).Read<PriceListDto>();
    }

    private Task<GuestOfferDto> Offer(HttpClient client) => client.GetAsync("/api/guest-offer").Read<GuestOfferDto>();

    [Fact]
    public async Task No_list_for_new_clients_means_no_offer()
    {
        await ListFor(60, new StatusesDto(null, null, null, true, null, false));
        var offer = await Offer(_factory.CreateApiClient());
        Assert.False(offer.Available);
    }

    [Fact]
    public async Task A_list_for_new_clients_is_offered_with_its_order_limit()
    {
        await ListFor(60, new StatusesDto(7, "day", 3, false, null, false));
        var offer = await Offer(_factory.CreateApiClient());
        Assert.True(offer.Available);
        Assert.Equal(3, offer.MaxOrders);
    }

    [Fact]
    public async Task A_list_at_the_regular_price_is_not_an_offer()
    {
        await ListFor(70, new StatusesDto(7, "day", null, false, null, false));
        Assert.False((await Offer(_factory.CreateApiClient())).Available);
    }

    [Fact]
    public async Task A_list_for_phones_only_is_not_an_offer()
    {
        var list = await _admin.PostAsJsonAsync(Lists, new PriceListInput("קבועים", null), TestFiles.Json).Read<PriceListDto>();
        (await _admin.PutAsJsonAsync($"{Lists}/{list.Id}/dishes", new DishesInput([new PriceListDishInput(_chicken, 70, 50, null, null)]),
            TestFiles.Json)).EnsureSuccessStatusCode();
        (await _admin.PutAsJsonAsync($"{Lists}/{list.Id}/phones", new PhonesInput(["0501234567"]), TestFiles.Json)).EnsureSuccessStatusCode();
        Assert.False((await Offer(_factory.CreateApiClient())).Available);
    }

    [Fact]
    public async Task A_logged_in_client_is_not_offered()
    {
        await ListFor(60, new StatusesDto(7, "day", null, false, null, false));
        var response = await _factory.CreateApiClient().PostAsJsonAsync("/api/account/login", new { phone = "0501234567" });
        var cookie = response.Headers.GetValues("Set-Cookie").Single(c => c.StartsWith(ApiFactory.SiteId + "_user=")).Split(';')[0];
        var client = _factory.CreateApiClient();
        client.DefaultRequestHeaders.Add("Cookie", cookie);
        Assert.False((await Offer(client)).Available);
    }
}
