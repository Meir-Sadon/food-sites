using System.ComponentModel;
using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using FoodSite.Api.Auth;
using FoodSite.Api.Sites;
using Microsoft.Extensions.Options;
using ModelContextProtocol.Server;

namespace FoodSite.Api.Mcp;

/// <summary>
/// The tools Claude sees once the admin connects it. Reading is separate from changing, so Claude asks the admin
/// before every change (a change tool is marked destructive). Everything runs as the admin who connected Claude.
/// </summary>
[McpServerToolType]
public class SiteTools(
    McpKnowledge knowledge,
    AdminOperations operations,
    AdminApiCaller api,
    FeatureFlags flags,
    IOptions<SiteOptions> site,
    IHttpContextAccessor http)
{
    /// <summary>A tool answer stays well under Claude's limit for one result.</summary>
    private const int MaxResultLength = 100_000;

    public const string Instructions = """
        You are connected to the admin of one home-food ordering site (a Hebrew, right-to-left site where clients order
        dishes for pickup or delivery). The person talking to you is the business owner or the platform's admin.
        Answer in the language they write in (usually Hebrew), briefly, in plain words.
        - To explain how something works or where to find it, use `site_overview` and `search_guide`, and name the
          admin screen (with its link from `site_overview`) where it is done by hand.
        - To read the current settings or menu, use `list_operations` once, then `read_site`.
        - To change something: read the current value first, tell the owner exactly what will change (before and after),
          and only then call `change_site`. For an update, send the whole object you read with only the changed fields
          edited. After a change, say it is saved and where to see it.
        - You cannot see orders, clients, reviews or reports, change passwords, or upload pictures. Say so and point to
          the admin screen instead.
        - Errors come back as codes; `site_overview` lists the Hebrew text for each code.
        """;

    [McpServerTool(Name = "site_overview", Title = "Site overview", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("The site's name, which optional features are on, the admin screens (name, section and full link) and the Hebrew text of each error code. Call it first.")]
    public async Task<string> SiteOverview(CancellationToken cancellationToken)
    {
        var enabled = await flags.EnabledAsync(cancellationToken);
        var origin = Origin();
        var result = new JsonObject
        {
            ["site"] = site.Value.Name ?? site.Value.Id,
            ["address"] = origin,
            ["connectedAs"] = Actor() == AdminActor.Master ? "the platform's admin (master)" : "the business owner",
            ["featuresOn"] = new JsonArray([.. enabled.Select(f => JsonValue.Create(f))]),
            ["adminScreens"] = new JsonArray([.. knowledge.Screens
                .Where(s => s.Feature is null || enabled.Contains(s.Feature))
                .Select(s => new JsonObject { ["name"] = s.Name, ["section"] = s.Section, ["link"] = origin + s.Path })]),
            ["errorTexts"] = new JsonObject(knowledge.Errors.Select(e => KeyValuePair.Create(e.Key, (JsonNode?)JsonValue.Create(e.Value)))),
        };
        return result.ToJsonString(JsonOptions);
    }

    [McpServerTool(Name = "search_guide", Title = "Search the feature guide", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Searches the site's feature guide (Hebrew), which explains what each feature does for clients and how the owner manages it. Pass Hebrew words, or a feature number. With no query, lists every feature's number and title.")]
    public string SearchGuide(
        [Description("Hebrew words to look for (such as \"משלוח\" or \"ימי אספקה\"), or a feature number. Empty lists all features.")] string? query = null)
    {
        query = query?.Trim();
        if (string.IsNullOrEmpty(query))
            return string.Join('\n', knowledge.Features.Select(f => $"{f.Number}. {f.Title} ({f.Group})"));

        var found = int.TryParse(query, NumberStyles.None, CultureInfo.InvariantCulture, out var number)
            ? knowledge.Features.Where(f => f.Number == number).ToList()
            : knowledge.Search(query).Take(5).ToList();
        if (found.Count == 0)
            return "No feature matches. Call search_guide with no query to see every feature's title, then try one of those words.";
        return Limit(string.Join("\n\n---\n\n", found.Select(f => $"{f.Number}. {McpKnowledge.FullText(f)}")));
    }

    [McpServerTool(Name = "list_operations", Title = "List what can be read and changed", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Lists the site data Claude can read (read_site) and the changes it can make (change_site), each with the admin screen it belongs to and, for changes, the JSON schema of the data to send.")]
    public string ListOperations()
    {
        var origin = Origin();
        var result = new JsonObject
        {
            ["read"] = new JsonArray([.. AdminOperations.All.Where(o => o.IsRead).Select(o => Describe(o, origin, schema: false))]),
            ["change"] = new JsonArray([.. AdminOperations.All.Where(o => !o.IsRead).Select(o => Describe(o, origin, schema: true))]),
        };
        return Limit(result.ToJsonString(JsonOptions));
    }

    [McpServerTool(Name = "read_site", Title = "Read site settings or menu", ReadOnly = true, Idempotent = true, OpenWorld = false)]
    [Description("Reads current site data, such as the settings, supply days or dishes. Names come from list_operations (read).")]
    public async Task<string> ReadSite(
        [Description("A read operation name from list_operations, such as \"settings\" or \"dishes\".")] string operation,
        [Description("The id, for operations that need one (such as a dish id).")] int? id = null,
        CancellationToken cancellationToken = default)
    {
        var op = AdminOperations.Find(operation);
        if (op is null || !op.IsRead)
            return $"Unknown read operation \"{operation}\". Call list_operations for the names.";
        return await CallAsync(op, id, null, cancellationToken);
    }

    [McpServerTool(Name = "change_site", Title = "Change site settings or menu", Destructive = true, Idempotent = false, OpenWorld = false)]
    [Description("Saves a change to the site, exactly as the admin would in the admin screens. Before calling, read the current data and tell the owner what will change. Names and data schemas come from list_operations (change).")]
    public async Task<string> ChangeSite(
        [Description("A change operation name from list_operations, such as \"updateSettings\" or \"setDishSoldOut\".")] string operation,
        [Description("The id, for operations that need one (such as a dish id or a pop-up slot).")] int? id = null,
        [Description("The data to send, following the operation's schema. For an update, the whole object you read with your changes.")] JsonElement? data = null,
        CancellationToken cancellationToken = default)
    {
        var op = AdminOperations.Find(operation);
        if (op is null || op.IsRead)
            return $"Unknown change operation \"{operation}\". Call list_operations for the names.";
        var json = data is { ValueKind: not (JsonValueKind.Undefined or JsonValueKind.Null) } body ? body.GetRawText() : null;
        if (json is null && operations.BodyType(op) is not null)
            return $"\"{op.Name}\" needs data. Call list_operations for its schema.";
        return await CallAsync(op, id, json, cancellationToken);
    }

    private async Task<string> CallAsync(AdminOperation op, int? id, string? json, CancellationToken ct)
    {
        string path;
        if (op.NeedsId)
        {
            if (id is null)
                return $"\"{op.Name}\" needs an id.";
            path = "/" + op.Route.Replace("{id}", id.Value.ToString(CultureInfo.InvariantCulture), StringComparison.Ordinal);
        }
        else
        {
            path = "/" + op.Route;
        }

        var response = await api.SendAsync(Actor(), op.Method, path, json, ct);
        var ok = response.Status is >= 200 and < 300;
        var text = new StringBuilder();
        text.Append(ok ? "OK" : "Failed").Append(" (HTTP ").Append(response.Status).Append(')');
        if (!ok && response.Status == 400)
            text.Append(". The error codes are explained in site_overview's errorTexts");
        if (!op.IsRead && ok)
            text.Append(". Saved. The owner can see it at ").Append(Origin()).Append(op.Screen);
        if (!string.IsNullOrWhiteSpace(response.Body))
            text.Append('\n').Append(response.Body);
        return Limit(text.ToString());
    }

    private JsonObject Describe(AdminOperation op, string origin, bool schema)
    {
        var item = new JsonObject
        {
            ["name"] = op.Name,
            ["description"] = op.Description,
            ["needsId"] = op.NeedsId,
            ["screen"] = origin + op.Screen,
        };
        if (schema && operations.BodySchema(op) is { } body)
            item["dataSchema"] = body;
        return item;
    }

    private string Actor() =>
        http.HttpContext?.User.FindFirst(AdminTokenService.ActorClaim)?.Value
        ?? throw new InvalidOperationException("The connector call has no admin.");

    private string Origin() =>
        http.HttpContext is { } context ? McpOAuth.Origin(context.Request) : "";

    private static string Limit(string text) =>
        text.Length <= MaxResultLength ? text : text[..MaxResultLength] + "\n…(cut: the answer is too long)";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };
}
