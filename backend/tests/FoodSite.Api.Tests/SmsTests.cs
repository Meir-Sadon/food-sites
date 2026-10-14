using System.Net;
using System.Text;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Messaging;
using Microsoft.Extensions.Options;

namespace FoodSite.Api.Tests;

public class SmsTests
{
    private class StubHandler(string body, HttpStatusCode code = HttpStatusCode.OK) : HttpMessageHandler
    {
        public string? Request { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Request = await request.Content!.ReadAsStringAsync(ct);
            return new HttpResponseMessage(code) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
        }
    }

    private static TextMeSmsSender Sender(StubHandler handler) => new(new HttpClient(handler),
        Options.Create(new SmsOptions { Username = "u", Token = "t", Source = "Shop", BaseUrl = "https://example.test/api" }));

    [Fact]
    public async Task Sends_the_provider_payload()
    {
        var handler = new StubHandler("""{"status":0,"message":"SMS will be sent","shipment_id":"1"}""");
        await Sender(handler).SendAsync("0501234567", "שלום");
        Assert.Contains("\"source\":\"Shop\"", handler.Request);
        Assert.Contains("0501234567", handler.Request);
    }

    [Fact]
    public async Task A_refusal_with_http_200_throws()
    {
        var handler = new StubHandler("""{"status":515,"message":"source not verified"}""");
        await Assert.ThrowsAsync<HttpRequestException>(() => Sender(handler).SendAsync("0501234567", "x"));
    }

    [Fact]
    public void Confirmation_fills_the_sites_own_template()
    {
        var order = new Order { Id = 7, Name = "דנה כהן", Phone = "0501234567", Address = "x", SupplyDate = new DateOnly(2026, 10, 20), Total = 120.5m, FulfillmentMethod = FulfillmentMethod.Pickup };
        Assert.Equal("Shop: דנה, הזמנה 7 ל-20/10, ₪120.5, איסוף עצמי",
            SmsMessages.Confirmation(order, "Shop", "{siteName}: {name}, הזמנה {orderId} ל-{date}, ₪{total}, {method}"));
        Assert.Contains("#7", SmsMessages.Confirmation(order, "Shop", null));
    }

    [Fact]
    public void Is_configured_only_with_all_three_values()
    {
        Assert.False(new SmsOptions { Username = "u", Token = "t" }.IsConfigured);
        Assert.True(new SmsOptions { Username = "u", Token = "t", Source = "S" }.IsConfigured);
    }
}
