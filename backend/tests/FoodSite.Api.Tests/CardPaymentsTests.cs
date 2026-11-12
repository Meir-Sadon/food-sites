using System.Net;
using System.Net.Http.Json;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Payments;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.EntityFrameworkCore;
using static FoodSite.Api.Controllers.Admin.CategoriesController;
using static FoodSite.Api.Controllers.Admin.DishesController;
using static FoodSite.Api.Controllers.Admin.SupplyDaysController;
using static FoodSite.Api.Controllers.CardPaymentsController;
using static FoodSite.Api.Controllers.OrdersController;
using static FoodSite.Api.Controllers.PublicController;

namespace FoodSite.Api.Tests;

[Collection(PostgresCollection.Name)]
public sealed class CardPaymentsTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string ClientPhone = "0501234567";

    private readonly ApiFactory _factory = new(postgres, new() { ["Site:Features:cardPayments"] = "true" });
    private HttpClient _client = null!;
    private int _dish;

    public async Task InitializeAsync()
    {
        var admin = await _factory.CreateAdminClientAsync();
        _client = _factory.CreateApiClient();
        var days = Enum.GetValues<DayOfWeek>().Select(d => new SupplyDayDto(d, true, (DayOfWeek)(((int)d + 6) % 7), new TimeOnly(0, 0)));
        (await admin.PutAsJsonAsync("/api/admin/supply-days", days, TestFiles.Json)).EnsureSuccessStatusCode();
        var category = await (await admin.PostAsJsonAsync("/api/admin/categories", new { name = "עופות" })).Read<CategoryDto>();
        _dish = (await (await admin.PostAsJsonAsync("/api/admin/dishes", new DishInput(
            "עוף בתנור", category.Id, null, null, SellBy.Units, ChoiceMode.Fixed, null, null, null, null, false, false,
            [new OptionInput(null, "שלם", 1, 70, true)], []), TestFiles.Json)).Read<DishDto>()).Id;
    }

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private async Task<HttpResponseMessage> Place(string payment = "CreditCard", HttpClient? client = null)
    {
        var menu = await (client ?? _client).GetAsync("/api/menu").Read<MenuDto>();
        return await (client ?? _client).PostAsJsonAsync("/api/orders", new Dictionary<string, object?>
        {
            ["phone"] = ClientPhone,
            ["name"] = "דנה",
            ["city"] = "אשקלון",
            ["street"] = "הרצל",
            ["houseNumber"] = "1",
            ["supplyDate"] = menu.SupplyDates[0].Date.ToString("yyyy-MM-dd"),
            ["fulfillmentMethod"] = "Delivery",
            ["paymentMethod"] = payment,
            ["items"] = new object[] { new { dishId = _dish, optionId = (int?)null, quantity = 1m, addOns = Array.Empty<object>() } },
        }, TestFiles.Json);
    }

    private string Sig(int order) => _factory.Services.GetRequiredService<CardLinks>().Sign(order);

    private Task<HttpResponseMessage> Callback(int order, string? sig, string data, bool withHeader = false)
    {
        // Invoice4U's server does not send the site's request header.
        var client = withHeader ? _client : _factory.CreateClient();
        return client.PostAsync($"/api/payments/card/callback?order={order}&sig={sig}",
            new FormUrlEncodedContent(new Dictionary<string, string> { ["Data"] = data }));
    }

    private static string Paid(string paymentId) => $$"""{"Success":"True","PaymentId":"{{paymentId}}","OrderIdClientUsage":"1"}""";

    private async Task<Order> OrderAsync(int id)
    {
        await using var db = _factory.CreateDbContext();
        return await db.Orders.IgnoreQueryFilters().AsNoTracking().SingleAsync(o => o.Id == id);
    }

    [Fact]
    public async Task SiteOffersCardOnlyWithTheFeatureAndAKey()
    {
        Assert.True((await _client.GetAsync("/api/site").Read<SiteDto>()).CardEnabled);
        _factory.Cards.IsConfigured = false;
        Assert.False((await _client.GetAsync("/api/site").Read<SiteDto>()).CardEnabled);
    }

    [Fact]
    public async Task CardOrderIsSavedUnpaidAndNobodyIsToldBeforePayment()
    {
        var confirmation = await Place().Read<ConfirmationDto>();

        Assert.Equal("https://pay.example.test/page/" + confirmation.Id, confirmation.PayUrl);
        var sent = Assert.Single(_factory.Cards.Pages);
        Assert.Equal(70m, sent.Amount);
        Assert.Contains($"/api/payments/card/callback?order={confirmation.Id}&sig={Sig(confirmation.Id)}", sent.CallBackUrl);
        Assert.Contains($"/order/card-return?order={confirmation.Id}&sig={Sig(confirmation.Id)}", sent.ReturnUrl);
        var order = await OrderAsync(confirmation.Id);
        Assert.False(order.IsPaid);
        Assert.Equal(PaymentMethod.CreditCard, order.PaymentMethod);
        Assert.Equal($"trace-{confirmation.Id}", order.CardTraceId);
        Assert.Empty(_factory.WhatsApp.Sent);
        Assert.Empty(_factory.Mail.Sent);
    }

    [Fact]
    public async Task CallbackConfirmedByTheClearingLogMarksPaidAndNotifiesOnce()
    {
        var id = (await Place().Read<ConfirmationDto>()).Id;
        _factory.Cards.Charges["P1"] = new CardCharge("P1", 70m, "12345", 1);

        // No request header: Invoice4U's server cannot send it.
        Assert.Equal(HttpStatusCode.OK, (await Callback(id, Sig(id), Paid("P1"))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Callback(id, Sig(id), Paid("P1"))).StatusCode);

        var order = await OrderAsync(id);
        Assert.True(order.IsPaid);
        Assert.Equal(PaidWith.CreditCard, order.PaidWith);
        Assert.Equal("P1", order.CardPaymentId);
        Assert.Equal("12345", order.CardConfirmation);
        Assert.Single(_factory.WhatsApp.MessagesTo(ClientPhone));
        Assert.Contains(_factory.WhatsApp.MessagesTo(ClientPhone), m => m.Contains("התשלום בכרטיס אשראי"));
    }

    [Fact]
    public async Task UnpaidCardOrderStaysOutOfTheAdminListUntilPaid()
    {
        var admin = await _factory.CreateAdminClientAsync();
        var id = (await Place().Read<ConfirmationDto>()).Id;
        Assert.DoesNotContain(await admin.GetAsync("/api/admin/orders").Read<List<FoodSite.Api.Controllers.Admin.OrdersAdminController.OrderDto>>(), o => o.Id == id);

        _factory.Cards.Charges["P1"] = new CardCharge("P1", 70m, "12345", 1);
        Assert.Equal(HttpStatusCode.OK, (await Callback(id, Sig(id), Paid("P1"))).StatusCode);

        Assert.Contains(await admin.GetAsync("/api/admin/orders").Read<List<FoodSite.Api.Controllers.Admin.OrdersAdminController.OrderDto>>(), o => o.Id == id);
    }

    [Fact]
    public async Task CallbackNeverPaysWithoutAMatchingCharge()
    {
        var id = (await Place().Read<ConfirmationDto>()).Id;

        // The callback says success but the log has nothing, or a different amount.
        Assert.Equal(HttpStatusCode.OK, (await Callback(id, Sig(id), Paid("P2"))).StatusCode);
        _factory.Cards.Charges["P2"] = new CardCharge("P2", 10m, null, 1);
        Assert.Equal(HttpStatusCode.OK, (await Callback(id, Sig(id), Paid("P2"))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Callback(id, Sig(id), """{"Success":"False","ErrorMessage":"declined"}""")).StatusCode);

        Assert.False((await OrderAsync(id)).IsPaid);
        Assert.Empty(_factory.WhatsApp.Sent);
    }

    [Fact]
    public async Task CallbackWithABadSignatureIsRefused()
    {
        var id = (await Place().Read<ConfirmationDto>()).Id;
        _factory.Cards.Charges["P3"] = new CardCharge("P3", 70m, null, 1);

        Assert.Equal(HttpStatusCode.NotFound, (await Callback(id, "0".PadLeft(32, '0'), Paid("P3"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Callback(id, null, Paid("P3"))).StatusCode);
        Assert.False((await OrderAsync(id)).IsPaid);
    }

    [Fact]
    public async Task ReturnPageFindsThePaymentEvenWhenTheCallbackNeverCame()
    {
        var id = (await Place().Read<ConfirmationDto>()).Id;
        var url = $"/api/payments/card/status?order={id}&sig={Sig(id)}";
        Assert.False((await _client.GetAsync(url).Read<StatusDto>()).Paid);

        _factory.Cards.Charges[$"trace-{id}"] = new CardCharge("P4", 70m, null, 3);
        var status = await _client.GetAsync(url).Read<StatusDto>();

        Assert.True(status.Paid);
        Assert.Equal(70m, status.Total);
        var order = await OrderAsync(id);
        Assert.Equal("אשראי, 3 תשלומים", order.PaymentComment);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync($"/api/payments/card/status?order={id}&sig=bad")).StatusCode);
    }

    [Fact]
    public async Task OrderIsTakenBackWhenThePaymentPageCannotBeOpened()
    {
        _factory.Cards.FailPages = true;
        var response = await Place();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("cardPaymentFailed", await response.Content.ReadAsStringAsync());
        await using var db = _factory.CreateDbContext();
        Assert.Equal(0, await db.Orders.CountAsync());
    }

    [Fact]
    public async Task CardIsRefusedWhileNotOffered()
    {
        _factory.Cards.IsConfigured = false;
        var response = await Place();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("paymentUnavailable", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task OtherPaymentsAreNotAffected()
    {
        var confirmation = await Place("OnDelivery").Read<ConfirmationDto>();

        Assert.Null(confirmation.PayUrl);
        Assert.Single(_factory.WhatsApp.MessagesTo(ClientPhone));
    }
}
