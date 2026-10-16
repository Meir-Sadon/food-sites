using System.Net;
using FoodSite.Api.Mail;
using FoodSite.Api.Sites;
using Microsoft.Extensions.Options;

namespace FoodSite.Api.Tests;

public sealed class BrevoMailerTests
{
    private sealed class StubHandler(HttpStatusCode status) : HttpMessageHandler
    {
        public HttpRequestMessage? Request { get; private set; }
        public string? Body { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Request = request;
            Body = await request.Content!.ReadAsStringAsync(ct);
            return new HttpResponseMessage(status) { Content = new StringContent("{\"message\":\"denied\"}") };
        }
    }

    private static BrevoMailer Mailer(StubHandler handler) => new(
        new HttpClient(handler),
        Options.Create(new MailOptions { BrevoApiKey = "key-1", From = "owner@example.com" }),
        Options.Create(new SiteOptions { Id = "dev", Name = "Test Site" }));

    [Fact]
    public async Task Sends_to_brevo_with_key_header_and_verified_sender()
    {
        var handler = new StubHandler(HttpStatusCode.Created);
        await Mailer(handler).SendAsync("to@example.com", "Subject", "<b>hi</b>", "hi");

        Assert.Equal("https://api.brevo.com/v3/smtp/email", handler.Request!.RequestUri!.ToString());
        Assert.Equal("key-1", handler.Request.Headers.GetValues("api-key").Single());
        Assert.Contains("\"email\":\"owner@example.com\"", handler.Body);
        Assert.Contains("\"email\":\"to@example.com\"", handler.Body);
        Assert.Contains("\"htmlContent\":\"\\u003Cb\\u003Ehi\\u003C/b\\u003E\"", handler.Body);
    }

    [Fact]
    public async Task Throws_when_brevo_refuses()
    {
        var ex = await Assert.ThrowsAsync<HttpRequestException>(
            () => Mailer(new StubHandler(HttpStatusCode.Forbidden)).SendAsync("to@example.com", "s", "h", "t"));
        Assert.Contains("Brevo answered 403", ex.Message);
    }

    [Fact]
    public void Brevo_key_alone_counts_as_configured()
    {
        Assert.True(new MailOptions { BrevoApiKey = "k" }.IsConfigured);
        Assert.False(new MailOptions().IsConfigured);
    }
}
