using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Schema;
using System.Text.Json.Serialization;
using System.Text.Json.Serialization.Metadata;
using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace FoodSite.Api.Mcp;

/// <summary>
/// One admin API call the connector may make: a name Claude uses, the call itself, and what it is for.
/// <paramref name="Screen"/> is the admin page where the admin does the same by hand.
/// </summary>
public record AdminOperation(string Name, string Method, string Route, string Screen, string Description)
{
    public bool IsRead => Method == "GET";
    public bool NeedsId => Route.Contains("{id}", StringComparison.Ordinal);
}

/// <summary>
/// The admin API calls the connector exposes. They are the site's settings and menu only: nothing that reads or
/// changes orders, clients, reviews, reports or passwords, so a client's details never reach Claude. Each call goes
/// through the ordinary admin endpoint (<see cref="AdminApiCaller"/>), with its validation and audit trail. A request
/// body's JSON schema comes from the endpoint itself (API explorer), so it follows the C# record as it changes.
/// </summary>
public class AdminOperations(IApiDescriptionGroupCollectionProvider apiExplorer)
{
    public static readonly IReadOnlyList<AdminOperation> All =
    [
        // Reads
        new("settings", "GET", "api/admin/settings", "/admin/settings",
            "General settings: business details, ordering rules, minimum order, delivery method and fee, payment, texts, look."),
        new("supplyDays", "GET", "api/admin/supply-days", "/admin/settings", "Supply days and their order hours."),
        new("shabbatRules", "GET", "api/admin/shabbat-rules", "/admin/settings", "Shabbat and holiday ordering rules."),
        new("closedDates", "GET", "api/admin/closed-dates", "/admin/settings", "Dates the business is closed for orders."),
        new("deliveryZones", "GET", "api/admin/delivery-zones", "/admin/settings", "Delivery zones (advanced delivery pricing)."),
        new("socialLinks", "GET", "api/admin/social-links", "/admin/social", "Social network links shown on the About page."),
        new("popups", "GET", "api/admin/popups", "/admin/popup", "The entry pop-ups (slots 1-3)."),
        new("messageTemplates", "GET", "api/admin/message-templates", "/admin/messages", "WhatsApp message templates."),
        new("accessibility", "GET", "api/admin/accessibility", "/admin/settings", "The accessibility statement details."),
        new("contact", "GET", "api/admin/contact", "/admin/contacts", "The business's contact details shown to clients."),
        new("categories", "GET", "api/admin/categories", "/admin/categories", "Menu categories in order."),
        new("dishGroups", "GET", "api/admin/dish-groups", "/admin/dish-groups", "Dish groups."),
        new("dishes", "GET", "api/admin/dishes", "/admin/dishes", "All dishes, with prices, categories and sold-out state."),
        new("dish", "GET", "api/admin/dishes/{id}", "/admin/dishes", "One dish with everything its form edits (id = dish id)."),

        // Changes
        new("updateSettings", "PUT", "api/admin/settings", "/admin/settings",
            "Saves the general settings. Send the whole object from `settings` with your changes."),
        new("updateInactiveAfter", "PUT", "api/admin/settings/inactive-after", "/admin/settings",
            "Sets after how long an idle order page reloads."),
        new("updateBadges", "PUT", "api/admin/settings/badges", "/admin/appearance", "Saves the dish badges (marks)."),
        new("updateSupplyDays", "PUT", "api/admin/supply-days", "/admin/settings", "Replaces the supply days and hours."),
        new("updateShabbatRules", "PUT", "api/admin/shabbat-rules", "/admin/settings", "Saves the Shabbat and holiday rules."),
        new("addClosedDate", "POST", "api/admin/closed-dates", "/admin/settings", "Adds a closed date."),
        new("removeClosedDate", "DELETE", "api/admin/closed-dates/{id}", "/admin/settings", "Removes a closed date (id from `closedDates`)."),
        new("updateDeliveryZones", "PUT", "api/admin/delivery-zones", "/admin/settings", "Replaces the whole list of delivery zones."),
        new("updateSocialLinks", "PUT", "api/admin/social-links", "/admin/social", "Replaces the social links."),
        new("updatePopup", "PUT", "api/admin/popups/{id}", "/admin/popup", "Saves one pop-up (id = slot 1-3). Pictures are set in the admin."),
        new("addMessageTemplate", "POST", "api/admin/message-templates", "/admin/messages", "Adds a WhatsApp message template."),
        new("updateMessageTemplate", "PUT", "api/admin/message-templates/{id}", "/admin/messages", "Edits a message template."),
        new("removeMessageTemplate", "DELETE", "api/admin/message-templates/{id}", "/admin/messages", "Removes a message template."),
        new("updateAccessibility", "PUT", "api/admin/accessibility", "/admin/settings", "Saves the accessibility statement details."),
        new("updateContact", "PUT", "api/admin/contact", "/admin/contacts", "Saves the business's contact details."),
        new("addCategory", "POST", "api/admin/categories", "/admin/categories", "Adds a category."),
        new("updateCategory", "PUT", "api/admin/categories/{id}", "/admin/categories", "Renames or edits a category."),
        new("moveCategory", "POST", "api/admin/categories/{id}/move", "/admin/categories", "Moves a category up or down."),
        new("removeCategory", "DELETE", "api/admin/categories/{id}", "/admin/categories", "Removes an empty category."),
        new("addDishGroup", "POST", "api/admin/dish-groups", "/admin/dish-groups", "Adds a dish group."),
        new("updateDishGroup", "PUT", "api/admin/dish-groups/{id}", "/admin/dish-groups", "Edits a dish group."),
        new("moveDishGroup", "POST", "api/admin/dish-groups/{id}/move", "/admin/dish-groups", "Moves a dish group up or down."),
        new("removeDishGroup", "DELETE", "api/admin/dish-groups/{id}", "/admin/dish-groups", "Removes a dish group."),
        new("addDish", "POST", "api/admin/dishes", "/admin/dishes", "Adds a dish. Pictures are added in the admin."),
        new("updateDish", "PUT", "api/admin/dishes/{id}", "/admin/dishes",
            "Saves a dish. Send the whole dish from `dish` with your changes (price, name, description, category...)."),
        new("setDishSoldOut", "PUT", "api/admin/dishes/{id}/sold-out", "/admin/dishes", "Marks a dish sold out or available again."),
        new("removeDish", "DELETE", "api/admin/dishes/{id}", "/admin/dishes", "Removes a dish (it can be restored)."),
        new("restoreDish", "POST", "api/admin/dishes/{id}/restore", "/admin/dishes", "Restores a removed dish."),
        new("reorderDishes", "PUT", "api/admin/dishes/order", "/admin/dishes", "Saves the order of the dishes."),
    ];

    public static AdminOperation? Find(string name) =>
        All.FirstOrDefault(o => string.Equals(o.Name, name, StringComparison.OrdinalIgnoreCase));

    private static readonly JsonSerializerOptions SchemaOptions = new(JsonSerializerDefaults.Web)
    {
        TypeInfoResolver = new DefaultJsonTypeInfoResolver(),
        Converters = { new JsonStringEnumConverter() },
    };

    /// <summary>The type an endpoint reads from the request body, or null when it takes none.</summary>
    public Type? BodyType(AdminOperation operation)
    {
        var description = apiExplorer.ApiDescriptionGroups.Items
            .SelectMany(g => g.Items)
            .FirstOrDefault(d => string.Equals(d.HttpMethod, operation.Method, StringComparison.OrdinalIgnoreCase)
                && string.Equals(Normalize(d.RelativePath), operation.Route, StringComparison.OrdinalIgnoreCase));
        return description?.ParameterDescriptions.FirstOrDefault(p => p.Source == BindingSource.Body)?.Type;
    }

    /// <summary>Whether the API has this endpoint (a test checks every operation against the controllers).</summary>
    public bool Exists(AdminOperation operation) =>
        apiExplorer.ApiDescriptionGroups.Items
            .SelectMany(g => g.Items)
            .Any(d => string.Equals(d.HttpMethod, operation.Method, StringComparison.OrdinalIgnoreCase)
                && string.Equals(Normalize(d.RelativePath), operation.Route, StringComparison.OrdinalIgnoreCase));

    public JsonNode? BodySchema(AdminOperation operation) =>
        BodyType(operation) is { } type ? JsonSchemaExporter.GetJsonSchemaAsNode(SchemaOptions, type) : null;

    /// <summary>Route templates without constraints: <c>api/admin/dishes/{id:int}</c> becomes <c>api/admin/dishes/{id}</c>.</summary>
    private static string? Normalize(string? path) =>
        path is null ? null : System.Text.RegularExpressions.Regex.Replace(path, @"\{(\w+)(:[^}]*)?\}", m => m.Groups[1].Value switch
        {
            "slot" => "{id}",
            var name => $"{{{name}}}",
        });
}
