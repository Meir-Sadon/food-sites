using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using FoodSite.Api.Auth;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Mcp;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using ModelContextProtocol.Client;
using ModelContextProtocol.Protocol;
using static FoodSite.Api.Controllers.Admin.CategoriesController;
using static FoodSite.Api.Controllers.Admin.McpConnectionsController;

namespace FoodSite.Api.Tests;

/// <summary>The Claude connector: OAuth sign-in through the admin's approval, the MCP tools, and turning it off.</summary>
[Collection(PostgresCollection.Name)]
public sealed class McpConnectorTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string Callback = "https://claude.ai/api/mcp/auth_callback";

    private readonly ApiFactory _factory = new(postgres, new() { ["Site:Features:mcp"] = "true" });

    public Task InitializeAsync() => Task.CompletedTask;

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    private record Tokens(string AccessToken, string RefreshToken);

    private static string Verifier() => McpOAuth.Base64Url(RandomNumberGenerator.GetBytes(32));

    private static string Challenge(string verifier) => McpOAuth.Base64Url(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));

    private async Task<string> RegisterAsync(string redirect = Callback)
    {
        var response = await _factory.CreateClient().PostAsJsonAsync("/oauth/register", new { client_name = "Claude", redirect_uris = new[] { redirect } });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("client_id").GetString()!;
    }

    /// <summary>Registers, approves as the given admin and trades the code: what Claude does when the admin connects it.</summary>
    private async Task<(Tokens Tokens, string ClientId)> ConnectAsync(HttpClient admin)
    {
        var clientId = await RegisterAsync();
        var verifier = Verifier();
        var approve = await admin.PostAsJsonAsync("/api/admin/mcp/approve", new ApproveRequest(
            clientId, Callback, Challenge(verifier), "S256", "state-1", "http://localhost/mcp"));
        Assert.Equal(HttpStatusCode.OK, approve.StatusCode);
        var redirect = new Uri((await approve.Content.ReadFromJsonAsync<ApproveResult>())!.RedirectUrl);
        var query = QueryHelpers.ParseQuery(redirect.Query);
        Assert.Equal("state-1", query["state"]);
        var tokens = await TokenAsync(new()
        {
            ["grant_type"] = "authorization_code",
            ["code"] = query["code"]!,
            ["redirect_uri"] = Callback,
            ["client_id"] = clientId,
            ["code_verifier"] = verifier,
        });
        Assert.Equal(HttpStatusCode.OK, tokens.StatusCode);
        return (await ReadTokens(tokens), clientId);
    }

    private Task<HttpResponseMessage> TokenAsync(Dictionary<string, string> form) =>
        _factory.CreateClient().PostAsync("/oauth/token", new FormUrlEncodedContent(form));

    private static async Task<Tokens> ReadTokens(HttpResponseMessage response)
    {
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        return new Tokens(json.GetProperty("access_token").GetString()!, json.GetProperty("refresh_token").GetString()!);
    }

    private async Task<McpClient> McpAsync(string accessToken)
    {
        var http = _factory.CreateClient();
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        var transport = new HttpClientTransport(
            new HttpClientTransportOptions { Endpoint = new Uri(http.BaseAddress!, "/mcp"), TransportMode = HttpTransportMode.StreamableHttp },
            http);
        return await McpClient.CreateAsync(transport);
    }

    private static async Task<string> CallAsync(McpClient client, string tool, Dictionary<string, object?>? args = null)
    {
        var result = await client.CallToolAsync(tool, args ?? []);
        Assert.NotEqual(true, result.IsError);
        return string.Join('\n', result.Content.OfType<TextContentBlock>().Select(c => c.Text));
    }

    [Fact]
    public async Task Everything_answers_404_while_the_feature_is_off()
    {
        await using var factory = new ApiFactory(postgres);
        var client = factory.CreateClient();
        var owner = await factory.CreateAdminClientAsync();

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/.well-known/oauth-authorization-server")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/.well-known/oauth-protected-resource/mcp")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync("/oauth/register", new { redirect_uris = new[] { Callback } })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync("/mcp", new StringContent("{}", Encoding.UTF8, "application/json"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync("/api/admin/mcp/connections")).StatusCode);
    }

    [Fact]
    public async Task Claude_finds_where_to_sign_in()
    {
        var client = _factory.CreateClient();

        var unauthorized = await client.PostAsync("/mcp", new StringContent("{}", Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.Unauthorized, unauthorized.StatusCode);
        Assert.Contains("resource_metadata=\"http://localhost/.well-known/oauth-protected-resource/mcp\"",
            unauthorized.Headers.WwwAuthenticate.ToString());

        var resource = await client.GetFromJsonAsync<JsonElement>("/.well-known/oauth-protected-resource/mcp");
        Assert.Equal("http://localhost/mcp", resource.GetProperty("resource").GetString());
        Assert.Equal("http://localhost", resource.GetProperty("authorization_servers")[0].GetString());

        var server = await client.GetFromJsonAsync<JsonElement>("/.well-known/oauth-authorization-server");
        Assert.Equal("http://localhost/oauth/token", server.GetProperty("token_endpoint").GetString());
        Assert.Equal("S256", server.GetProperty("code_challenge_methods_supported")[0].GetString());
        Assert.Equal("none", server.GetProperty("token_endpoint_auth_methods_supported")[0].GetString());
    }

    [Fact]
    public async Task Only_claudes_redirect_addresses_can_register_and_authorize()
    {
        var client = _factory.CreateClient();
        var other = await client.PostAsJsonAsync("/oauth/register", new { redirect_uris = new[] { "https://evil.example/callback" } });
        Assert.Equal(HttpStatusCode.BadRequest, other.StatusCode);
        Assert.Equal("invalid_redirect_uri", (await other.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString());

        // Claude Code's loopback callback may use any port.
        await RegisterAsync("http://localhost:33418/callback");

        var clientId = await RegisterAsync();
        var authorize = await _factory.CreateClient(new() { AllowAutoRedirect = false }).GetAsync(
            $"/oauth/authorize?response_type=code&client_id={Uri.EscapeDataString(clientId)}&redirect_uri={Uri.EscapeDataString(Callback)}&state=s&code_challenge=c&code_challenge_method=S256");
        Assert.Equal(HttpStatusCode.Redirect, authorize.StatusCode);
        Assert.StartsWith("/admin/claude-connect?response_type=code", authorize.Headers.Location!.OriginalString);

        // A forged client id or another redirect address is refused, never redirected.
        var forged = await client.GetAsync($"/oauth/authorize?client_id={Uri.EscapeDataString(clientId + "x")}&redirect_uri={Uri.EscapeDataString(Callback)}");
        Assert.Equal(HttpStatusCode.BadRequest, forged.StatusCode);
        var otherRedirect = await client.GetAsync(
            $"/oauth/authorize?client_id={Uri.EscapeDataString(clientId)}&redirect_uri={Uri.EscapeDataString("https://claude.com/api/mcp/auth_callback")}");
        Assert.Equal(HttpStatusCode.BadRequest, otherRedirect.StatusCode);

        var owner = await _factory.CreateAdminClientAsync();
        var info = await owner.GetFromJsonAsync<ApprovalInfoDto>(
            $"/api/admin/mcp/approval?clientId={Uri.EscapeDataString(clientId)}&redirectUri={Uri.EscapeDataString(Callback)}");
        Assert.Equal(new ApprovalInfoDto("Claude", "claude.ai"), info);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await _factory.CreateApiClient().GetAsync($"/api/admin/mcp/approval?clientId={Uri.EscapeDataString(clientId)}&redirectUri={Uri.EscapeDataString(Callback)}")).StatusCode);
    }

    [Fact]
    public async Task A_code_works_once_and_only_with_its_verifier()
    {
        var owner = await _factory.CreateAdminClientAsync();
        var clientId = await RegisterAsync();
        var verifier = Verifier();
        var approve = await owner.PostAsJsonAsync("/api/admin/mcp/approve", new ApproveRequest(clientId, Callback, Challenge(verifier), "S256", null, null));
        var code = QueryHelpers.ParseQuery(new Uri((await approve.Content.ReadFromJsonAsync<ApproveResult>())!.RedirectUrl).Query)["code"].ToString();
        Dictionary<string, string> Form(string v) => new()
        {
            ["grant_type"] = "authorization_code",
            ["code"] = code,
            ["redirect_uri"] = Callback,
            ["client_id"] = clientId,
            ["code_verifier"] = v,
        };

        var wrong = await TokenAsync(Form(Verifier()));
        Assert.Equal(HttpStatusCode.BadRequest, wrong.StatusCode);
        Assert.Equal("invalid_grant", (await wrong.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString());
        Assert.Equal(HttpStatusCode.OK, (await TokenAsync(Form(verifier))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await TokenAsync(Form(verifier))).StatusCode);
    }

    [Fact]
    public async Task Refreshing_rotates_the_tokens_and_disconnecting_turns_them_off()
    {
        var owner = await _factory.CreateAdminClientAsync();
        var (tokens, clientId) = await ConnectAsync(owner);

        var refreshed = await TokenAsync(new() { ["grant_type"] = "refresh_token", ["refresh_token"] = tokens.RefreshToken, ["client_id"] = clientId });
        Assert.Equal(HttpStatusCode.OK, refreshed.StatusCode);
        var fresh = await ReadTokens(refreshed);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await TokenAsync(new() { ["grant_type"] = "refresh_token", ["refresh_token"] = tokens.RefreshToken })).StatusCode);

        await using (var client = await McpAsync(fresh.AccessToken))
            Assert.NotEmpty(await client.ListToolsAsync());

        var connection = Assert.Single(await owner.GetFromJsonAsync<List<ConnectionDto>>("/api/admin/mcp/connections") ?? []);
        Assert.Equal(("Claude", AdminActor.Owner), (connection.ClientName, connection.Actor));
        Assert.Equal(HttpStatusCode.NoContent, (await owner.DeleteAsync($"/api/admin/mcp/connections/{connection.Id}")).StatusCode);
        Assert.Empty(await owner.GetFromJsonAsync<List<ConnectionDto>>("/api/admin/mcp/connections") ?? []);

        var after = _factory.CreateClient();
        after.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", fresh.AccessToken);
        Assert.Equal(HttpStatusCode.Unauthorized, (await after.PostAsync("/mcp", new StringContent("{}", Encoding.UTF8, "application/json"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await TokenAsync(new() { ["grant_type"] = "refresh_token", ["refresh_token"] = fresh.RefreshToken })).StatusCode);
    }

    [Fact]
    public async Task The_connector_token_is_not_an_admin_session()
    {
        var (tokens, _) = await ConnectAsync(await _factory.CreateAdminClientAsync());
        var client = _factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", tokens.AccessToken);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/admin/settings")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/ops/version")).StatusCode);
    }

    [Fact]
    public async Task Claude_explains_reads_and_changes_as_the_admin_with_an_audit_entry()
    {
        var owner = await _factory.CreateAdminClientAsync();
        var (tokens, _) = await ConnectAsync(owner);
        await using var client = await McpAsync(tokens.AccessToken);

        var tools = (await client.ListToolsAsync()).ToDictionary(t => t.Name);
        Assert.Equal(["change_site", "list_operations", "read_site", "search_guide", "site_overview"], tools.Keys.Order());
        Assert.True(tools["read_site"].ProtocolTool.Annotations?.ReadOnlyHint);
        Assert.True(tools["change_site"].ProtocolTool.Annotations?.DestructiveHint);
        Assert.False(string.IsNullOrEmpty(client.ServerInstructions));

        var overview = await CallAsync(client, "site_overview");
        Assert.Contains(ApiFactory.SiteName, overview);
        Assert.Contains("http://localhost/admin/settings", overview);
        Assert.Contains("mcp", overview);

        var guide = await CallAsync(client, "search_guide", new() { ["query"] = "קטגוריות" });
        Assert.Contains("תפריט לפי קטגוריות", guide);

        var operations = await CallAsync(client, "list_operations");
        Assert.Contains("updateCategory", operations);
        Assert.Contains("dataSchema", operations);

        var added = await CallAsync(client, "change_site", new()
        {
            ["operation"] = "addCategory",
            ["data"] = JsonSerializer.SerializeToElement(new CategoryInput("סלטים")),
        });
        Assert.StartsWith("OK (HTTP 200)", added);
        Assert.Contains("http://localhost/admin/categories", added);

        var read = await CallAsync(client, "read_site", new() { ["operation"] = "categories" });
        Assert.Contains("סלטים", read);

        // The endpoint validates as it does for the admin, and the code comes back for Claude to explain.
        var invalid = await CallAsync(client, "change_site", new()
        {
            ["operation"] = "addCategory",
            ["data"] = JsonSerializer.SerializeToElement(new CategoryInput("")),
        });
        Assert.StartsWith("Failed (HTTP 400)", invalid);

        // Reading cannot change, and an operation outside the list does not exist.
        Assert.StartsWith("Unknown read operation", await CallAsync(client, "read_site", new() { ["operation"] = "addCategory" }));
        Assert.StartsWith("Unknown change operation", await CallAsync(client, "change_site", new() { ["operation"] = "orders" }));

        await using var db = _factory.CreateDbContext();
        var entry = await db.AuditEntries.SingleAsync(e => e.EntityType == nameof(Category));
        Assert.Equal(AdminActor.ThroughClaude(AdminActor.Owner), entry.Actor);
        // The connection itself is audited without its secrets.
        var connection = await db.AuditEntries.FirstAsync(e => e.EntityType == nameof(McpConnection));
        Assert.DoesNotContain(tokens.AccessToken, connection.Changes ?? "");
    }

    [Fact]
    public void Every_operation_is_a_real_admin_endpoint()
    {
        var operations = _factory.Services.GetRequiredService<AdminOperations>();
        foreach (var operation in AdminOperations.All)
        {
            Assert.True(operations.Exists(operation), $"{operation.Name}: {operation.Method} {operation.Route} is not an endpoint");
            Assert.StartsWith("api/admin/", operation.Route);
            if (operation.IsRead)
                Assert.Null(operations.BodyType(operation));
        }
        Assert.Equal(AdminOperations.All.Count, AdminOperations.All.Select(o => o.Name).Distinct().Count());
        // Nothing about orders, clients, reviews, reports, passwords or tokens.
        foreach (var blocked in new[] { "orders", "clients", "reviews", "reports", "usage", "audit", "password", "ops-token", "mcp", "price-lists", "driver-routes", "notify-phones" })
            Assert.DoesNotContain(AdminOperations.All, o => o.Route.Contains(blocked, StringComparison.Ordinal));
    }
}
