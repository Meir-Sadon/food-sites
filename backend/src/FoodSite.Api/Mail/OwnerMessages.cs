using System.Globalization;
using System.Net;
using System.Text;
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

    /// <summary>
    /// The new-order mail: everything about the order (who, when, where, payment, every dish with its option, remark,
    /// answers and add-ons, prices and totals), spaced out, and a link that opens the order in the admin.
    /// </summary>
    public static OwnerMail NewOrder(Order order, string? siteName, bool hourFull, string? adminUrl = null)
    {
        var sections = NewOrderSections(order, hourFull);
        var site = string.IsNullOrWhiteSpace(siteName) ? null : siteName.Trim();
        var title = $"הזמנה חדשה #{order.Id}";

        var text = string.Join("\n\n", new[] { site, title }.Where(x => x is not null)
            .Append(string.Join("\n\n", sections.Select(s => s.Heading is null ? s.Lines.Join("\n") : $"{s.Heading}\n{s.Lines.Join("\n")}"))));
        if (adminUrl is not null)
            text += $"\n\nפתיחת ההזמנה בניהול האתר (נדרשת כניסה):\n{adminUrl}";

        var html = new StringBuilder();
        html.Append("<div dir=\"rtl\" lang=\"he\" style=\"text-align:right;font-family:Arial,sans-serif;font-size:16px;line-height:1.7;color:#222;max-width:560px\">");
        if (site is not null)
            html.Append($"<p style=\"margin:0 0 4px;color:#666\">{Enc(site)}</p>");
        html.Append($"<h1 style=\"margin:0 0 20px;font-size:24px\">{Enc(title)}</h1>");
        if (adminUrl is not null)
            html.Append($"<p style=\"margin:0 0 24px\"><a href=\"{Enc(adminUrl)}\" style=\"display:inline-block;padding:12px 20px;background:#7a1f1f;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold\">פתיחת ההזמנה בניהול האתר</a></p>");
        foreach (var section in sections)
        {
            html.Append("<div style=\"margin:0 0 22px;padding:0 0 16px;border-bottom:1px solid #e4e4e4\">");
            if (section.Heading is not null)
                html.Append($"<h2 style=\"margin:0 0 8px;font-size:15px;color:#7a1f1f\">{Enc(section.Heading)}</h2>");
            foreach (var line in section.Lines)
                html.Append($"<div style=\"margin:0 0 {(line.StartsWith("  ") ? 2 : 8)}px;{(line.StartsWith("  ") ? "padding-right:18px;color:#555;font-size:15px" : "")}\">{Enc(line.TrimStart())}</div>");
            html.Append("</div>");
        }
        if (adminUrl is not null)
            html.Append($"<p style=\"margin:0;color:#666;font-size:14px\">הקישור מצריך כניסה לניהול האתר: <span dir=\"ltr\">{Enc(adminUrl)}</span></p>");
        html.Append("</div>");

        return new($"הזמנה חדשה #{order.Id} מאת {order.Name}", html.ToString(), text);
    }

    private record Section(string? Heading, List<string> Lines);

    private static List<Section> NewOrderSections(Order order, bool hourFull)
    {
        var delivery = order.FulfillmentMethod == FulfillmentMethod.Delivery;
        var sections = new List<Section>();

        var alerts = new List<string>();
        if (order.NeedsReview)
            alerts.Add("הכתובת מחוץ לאזור השירות: ההזמנה ממתינה לאישור שלך.");
        if (hourFull)
            alerts.Add("השעה שנבחרה כבר מלאה: כדאי לתאם שעה אחרת עם הלקוח.");
        if (alerts.Count > 0)
            sections.Add(new("שימו לב", alerts));

        sections.Add(new("הלקוח", [
            order.Name,
            $"טלפון: {order.Phone}",
            order.UserId is null ? "הזמנה כאורח (ללא חשבון)" : "לקוח רשום",
        ]));

        var when = new List<string>
        {
            delivery ? "משלוח" : "איסוף עצמי",
            $"תאריך: {order.SupplyDate.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture)}",
        };
        if (order.DeliveryHour is { } hour)
            when.Add($"שעה: {hour.ToString("HH:mm", CultureInfo.InvariantCulture)}");
        if (delivery)
            when.Add($"כתובת: {order.Address}");
        sections.Add(new("אספקה", when));

        var payment = order.PaymentMethod == PaymentMethod.Transfer ? "העברה (Bit / PayBox)" : "תשלום במעמד המסירה";
        sections.Add(new("תשלום", [payment, $"סה״כ לתשלום: ₪{Money(order.Total)}"]));

        var dishes = new List<string>();
        foreach (var item in order.Items.Where(i => i.ParentItemId is null && i.ParentItem is null).OrderBy(i => i.Id))
        {
            dishes.Add($"{Number(item.Quantity)} × {item.DishName}"
                + (string.IsNullOrEmpty(item.OptionLabel) ? "" : $" ({item.OptionLabel})")
                + $" – ₪{Money(item.LineTotal)}"
                + (item.Quantity > 1 || item.UnitPrice != item.LineTotal ? $" (₪{Money(item.UnitPrice)} ליחידה)" : ""));
            if (!string.IsNullOrWhiteSpace(item.Note))
                dishes.Add($"  הערה למנה: {item.Note}");
            dishes.AddRange((item.Answers ?? []).Select(a => $"  {a.Question}: {a.Answer}"));
            foreach (var addOn in item.AddOnItems.OrderBy(a => a.Id))
                dishes.Add($"  + {Number(addOn.Quantity)} × {addOn.DishName}"
                    + (string.IsNullOrEmpty(addOn.OptionLabel) ? "" : $" ({addOn.OptionLabel})")
                    + (addOn.LineTotal > 0 ? $" – ₪{Money(addOn.LineTotal)}" : ""));
        }
        sections.Add(new("המנות שהוזמנו", dishes));

        if (!string.IsNullOrWhiteSpace(order.Notes))
            sections.Add(new("הערות הלקוח", [order.Notes!]));

        sections.Add(new(null, [$"סה״כ: ₪{Money(order.Total)}"]));
        return sections;
    }

    private static string Join(this IEnumerable<string> lines, string separator) => string.Join(separator, lines);

    private static string Enc(string value) => WebUtility.HtmlEncode(value);

    private static string Number(decimal value) => value.ToString("0.###", CultureInfo.InvariantCulture);

    private static string Money(decimal value) => value.ToString("0.##", CultureInfo.InvariantCulture);

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
