using System.Net;
using System.Text;
using System.Text.Json.Nodes;
using FoodSite.Api.Payments;
using Microsoft.Extensions.Options;

namespace FoodSite.Api.Tests;

/// <summary>Invoice4UGateway against canned answers shaped like the ones in Invoice4U's documentation.</summary>
public class Invoice4UGatewayTests
{
    private const string Key = "d2f1a6b3-1234-4c9a-9f00-1a2b3c4d5e6f";

    private sealed class Stub(string answer) : HttpMessageHandler
    {
        public HttpRequestMessage? Request { get; private set; }
        public JsonNode? Body { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Request = request;
            Body = JsonNode.Parse(await request.Content!.ReadAsStringAsync(ct));
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(answer, Encoding.UTF8, "application/json") };
        }
    }

    private static Invoice4UGateway Gateway(Stub stub, bool qa = true) =>
        new(new HttpClient(stub), Options.Create(new Invoice4UOptions { ApiKey = Key, QaMode = qa }), TimeProvider.System);

    private static CardPageRequest Request() =>
        new(10045, 117m, "Israel Israeli", "0501234567", "הזמנה #10045", "https://shop.test/return", "https://shop.test/callback");

    [Fact]
    public async Task OpensAHostedPageOnTheQaServiceInQaMode()
    {
        var stub = new Stub("""{"d":{"Errors":null,"ClearingRedirectUrl":"https://secure.cardcom.test/pay/abc","OpenInfo":[{"Key":"ClearingTraceId","Value":"trace-1"},{"Key":"PaymentId","Value":"0"}]}}""");

        var page = await Gateway(stub).CreatePageAsync(Request(), default);

        Assert.Equal("https://secure.cardcom.test/pay/abc", page.Url);
        Assert.Equal("trace-1", page.TraceId);
        Assert.Equal("https://apiqa.invoice4u.co.il/Services/ApiService.svc/ProcessApiRequestV2", stub.Request!.RequestUri!.ToString());
        var sent = stub.Body!["request"]!;
        Assert.Equal(Key, (string?)sent["Invoice4UUserApiKey"]);
        Assert.Equal(117m, (decimal?)sent["Sum"]);
        Assert.True((bool?)sent["IsQaMode"]);
        Assert.Equal("10045", (string?)sent["OrderIdClientUsage"]);
    }

    [Fact]
    public async Task UsesTheProductionServiceOutsideQaMode()
    {
        var stub = new Stub("""{"d":{"ClearingRedirectUrl":"https://secure.cardcom.test/pay/abc"}}""");
        await Gateway(stub, qa: false).CreatePageAsync(Request(), default);

        Assert.StartsWith("https://api.invoice4u.co.il/", stub.Request!.RequestUri!.ToString());
        Assert.False((bool?)stub.Body!["request"]!["IsQaMode"]);
    }

    [Fact]
    public async Task ErrorsAndNonHttpsAddressesAreRefused()
    {
        var unauthorized = new Stub("""{"d":{"Errors":[{"ID":80,"Error":"UnauthorizedUser","Paramters":null}],"ClearingRedirectUrl":null}}""");
        await Assert.ThrowsAsync<CardGatewayException>(() => Gateway(unauthorized).CreatePageAsync(Request(), default));

        // A provider rejection puts its text where the address should be.
        var rejected = new Stub("""{"d":{"Errors":null,"ClearingRedirectUrl":"terminal not found"}}""");
        await Assert.ThrowsAsync<CardGatewayException>(() => Gateway(rejected).CreatePageAsync(Request(), default));
        var plain = new Stub("""{"d":{"ClearingRedirectUrl":"http://insecure.test/pay"}}""");
        await Assert.ThrowsAsync<CardGatewayException>(() => Gateway(plain).CreatePageAsync(Request(), default));
    }

    [Fact]
    public async Task FindsOnlyASuccessfulChargeByPaymentId()
    {
        var stub = new Stub("""{"d":[{"IsSuccess":true,"IsCredit":true,"PaymentId":"P9","Amount":50},{"IsSuccess":true,"IsCredit":false,"PaymentId":"P9","Amount":117.0,"ClearingConfirmationNumber":"777","PaymentNumber":3}]}""");

        var charge = await Gateway(stub).FindChargeAsync("P9", null, default);

        Assert.Equal(new CardCharge("P9", 117m, "777", 3), charge);
        Assert.Equal("P9", (string?)stub.Body!["searchParams"]!["PaymentId"]);
        Assert.Equal(Key, (string?)stub.Body["token"]);
    }

    [Fact]
    public async Task WithoutAPaymentIdItMatchesTheTraceId()
    {
        var stub = new Stub("""{"d":[{"IsSuccess":true,"IsCredit":false,"ClearingTraceId":"other","Amount":117},{"IsSuccess":true,"IsCredit":false,"ClearingTraceId":"trace-1","PaymentId":"P1","Amount":117}]}""");

        Assert.Equal("P1", (await Gateway(stub).FindChargeAsync(null, "trace-1", default))?.PaymentId);
        Assert.Null(await Gateway(new Stub("""{"d":null}""")).FindChargeAsync("P1", null, default));
    }
}
