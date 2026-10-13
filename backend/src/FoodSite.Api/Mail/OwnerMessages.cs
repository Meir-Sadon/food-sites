using System.Net;
using System.Text.Json;
using FoodSite.Api.Audit;
using FoodSite.Api.Auth;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Orders;

namespace FoodSite.Api.Mail;

public record OwnerMail(string Subject, string Html, string Text);

/// <summary>The Hebrew texts of the mails the business owner gets.</summary>
public static class OwnerMessages
{
    private static readonly Dictionary<string, string> EntityNames = new()
    {
        [nameof(Settings)] = "הגדרות האתר",
        [nameof(SupplyDay)] = "יום אספקה",
        [nameof(ClosedDate)] = "תאריך סגור",
        [nameof(Category)] = "קטגוריה",
        [nameof(Dish)] = "מנה",
        [nameof(DishImage)] = "תמונת מנה",
        [nameof(DishOption)] = "אפשרות מנה",
        [nameof(DishAddOn)] = "תוספת למנה",
        [nameof(AddOnGroup)] = "קבוצת תוספות",
        [nameof(DishQuestion)] = "שאלה במנה",
        [nameof(NotifyPhone)] = "מספר להתראות",
        [nameof(MessageTemplate)] = "תבנית הודעה",
        [nameof(FeatureFlag)] = "יכולת באתר",
    };

    /// <summary>What the owner is told about: the dishes and the site's settings, not orders, reviews or logins.</summary>
    public static bool IsOwnerRelevant(AuditEntry entry) =>
        entry.EntityType is { } type && EntityNames.ContainsKey(type);

    public static string ActorName(string actor) => actor switch
    {
        AdminActor.Owner => "בעל העסק",
        AdminActor.Master => "המנהל הראשי",
        _ => actor,
    };

    public static OwnerMail NewOrder(Order order, string? siteName, bool hourFull)
    {
        var text = OrderMessages.AdminNotification(order, siteName, hourFull);
        return new($"הזמנה חדשה #{order.Id} מאת {order.Name}", Html(text), text);
    }

    public static OwnerMail Changes(IReadOnlyList<AuditEntry> entries, string? siteName)
    {
        var lines = new List<string>();
        foreach (var byActor in entries.GroupBy(e => e.Actor))
        {
            lines.Add($"{ActorName(byActor.Key)} ביצע/ה:");
            foreach (var e in byActor.OrderBy(e => e.At))
            {
                var action = e.Action switch { AuditAction.Added => "הוסיף/ה", AuditAction.Deleted => "מחק/ה", _ => "עדכן/ה" };
                var label = string.IsNullOrWhiteSpace(e.Label) ? "" : $" \"{e.Label}\"";
                lines.Add($"• {action} {EntityNames[e.EntityType!]}{label}{Details(e)}");
            }
        }
        var heading = string.IsNullOrWhiteSpace(siteName) ? "" : $"{siteName.Trim()}\n";
        var text = $"{heading}בוצעו שינויים במנות או בהגדרות האתר:\n" + string.Join('\n', lines);
        return new($"שינויים באתר{(string.IsNullOrWhiteSpace(siteName) ? "" : $" {siteName.Trim()}")}", Html(text), text);
    }

    private static string Details(AuditEntry entry)
    {
        if (entry.Action != AuditAction.Modified || string.IsNullOrEmpty(entry.Changes))
            return "";
        List<AuditChange>? changes;
        try
        {
            changes = JsonSerializer.Deserialize<List<AuditChange>>(entry.Changes, JsonSerializerOptions.Web);
        }
        catch (JsonException)
        {
            return "";
        }
        if (changes is not { Count: > 0 })
            return "";
        var parts = changes.Take(8).Select(c => c.Secret
            ? $"{c.Field} שונתה"
            : $"{c.Field}: {Value(c.From)} ← {Value(c.To)}");
        return " (" + string.Join("; ", parts) + (changes.Count > 8 ? $"; ועוד {changes.Count - 8}" : "") + ")";
    }

    private static string Value(string? value) => string.IsNullOrEmpty(value) ? "ריק" : value;

    /// <summary>The plain text in a right-to-left page, escaped, one line per line.</summary>
    private static string Html(string text) =>
        "<div dir=\"rtl\" lang=\"he\" style=\"text-align:right;font-family:Arial,sans-serif;font-size:16px;line-height:1.5\">"
        + WebUtility.HtmlEncode(text).Replace("\n", "<br>")
        + "</div>";
}
