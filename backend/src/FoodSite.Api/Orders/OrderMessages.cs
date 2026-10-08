using System.Globalization;
using FoodSite.Api.Data.Entities;

namespace FoodSite.Api.Orders;

/// <summary>
/// The texts of the WhatsApp messages. They become Meta message templates once approved.
/// Each starts with the business's name, so messages from a number several sites share stay clear.
/// </summary>
public static class OrderMessages
{
    public static string ClientConfirmation(
        Order order, string? paymentPhone, string? siteName = null, IReadOnlyList<string>? serviceCities = null,
        bool hourFull = false)
    {
        var text = $"{Heading(siteName)}תודה, ההזמנה שלך התקבלה!\n{Details(order)}";
        if (order.NeedsReview)
            text += $"\nאנחנו משלוחים רק ב{ServiceArea.Describe(serviceCities ?? [])}. ההזמנה תיבדק על ידי המנהל, אינה הזמנה בטוחה, והכמות לא נשמרת עד לאישור.";
        if (hourFull)
            text += "\nהשעה שבחרת כבר מלאה: ניצור איתך קשר כדי לתאם שעה אחרת.";
        if (order.PaymentMethod == PaymentMethod.Transfer && !string.IsNullOrWhiteSpace(paymentPhone))
            text += $"\nלהעברת התשלום ב־Bit / PayBox: {paymentPhone}";
        else if (order.PaymentMethod == PaymentMethod.OnDelivery)
            text += "\nהתשלום יבוצע במעמד מסירת המשלוח.";
        return text;
    }

    public static string AdminNotification(Order order, string? siteName = null, bool hourFull = false) =>
        $"{Heading(siteName)}הזמנה חדשה #{order.Id}\n{Details(order)}"
        + (order.NeedsReview ? "\nהכתובת מחוץ לאזור השירות: ההזמנה ממתינה לאישור שלך." : "")
        + (hourFull ? "\nהשעה שנבחרה כבר מלאה: כדאי לתאם שעה אחרת עם הלקוח." : "");

    private static string Heading(string? siteName) =>
        string.IsNullOrWhiteSpace(siteName) ? "" : $"{siteName.Trim()}\n";

    private static string Details(Order order)
    {
        var lines = new List<string>
        {
            $"הזמנה #{order.Id} · {order.SupplyDate.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture)} · "
                + (order.DeliveryHour is { } hour ? $"{Time(hour)} · " : "")
                + (order.FulfillmentMethod == FulfillmentMethod.Delivery ? "משלוח" : "איסוף עצמי"),
            $"{order.Name}, {order.Phone}",
        };
        if (order.FulfillmentMethod == FulfillmentMethod.Delivery)
            lines.Add(order.Address);

        foreach (var item in order.Items.Where(i => i.ParentItemId is null && i.ParentItem is null))
        {
            lines.Add(Line(item, ""));
            foreach (var addOn in item.AddOnItems)
                lines.Add(Line(addOn, "  + "));
        }
        if (!string.IsNullOrWhiteSpace(order.Notes))
            lines.Add($"הערות: {order.Notes}");
        lines.Add($"סה״כ: ₪{Money(order.Total)}");
        return string.Join('\n', lines);
    }

    private static string Line(OrderItem item, string prefix) =>
        $"{prefix}{Number(item.Quantity)} × {item.DishName}"
        + (string.IsNullOrEmpty(item.OptionLabel) ? "" : $" ({item.OptionLabel})")
        + $" – ₪{Money(item.LineTotal)}";

    private static string Time(TimeOnly value) => value.ToString("HH:mm", CultureInfo.InvariantCulture);

    private static string Number(decimal value) => value.ToString("0.###", CultureInfo.InvariantCulture);

    private static string Money(decimal value) => value.ToString("0.##", CultureInfo.InvariantCulture);
}
