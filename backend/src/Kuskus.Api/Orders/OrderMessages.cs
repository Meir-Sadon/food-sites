using System.Globalization;
using Kuskus.Api.Data.Entities;

namespace Kuskus.Api.Orders;

/// <summary>The texts of the WhatsApp messages. They become Meta message templates once approved.</summary>
public static class OrderMessages
{
    public static string LoginCode(string code) => $"קוד האימות שלך להקוסקוס של אמא: {code}\nהקוד תקף למספר דקות.";

    public static string ClientConfirmation(Order order, string? paymentPhone)
    {
        var text = $"תודה, ההזמנה שלך התקבלה!\n{Details(order)}";
        if (order.NeedsReview)
            text += $"\nאנחנו משלוחים רק ב{AddressFormat.ServiceCity}. ההזמנה תיבדק על ידי המנהל, אינה הזמנה בטוחה, והכמות לא נשמרת עד לאישור.";
        if (order.PaymentMethod == PaymentMethod.Transfer && !string.IsNullOrWhiteSpace(paymentPhone))
            text += $"\nלהעברת התשלום ב־Bit / PayBox: {paymentPhone}";
        else if (order.PaymentMethod == PaymentMethod.OnDelivery)
            text += "\nהתשלום יבוצע במעמד מסירת המשלוח.";
        return text;
    }

    public static string AdminNotification(Order order) =>
        $"הזמנה חדשה #{order.Id}\n{Details(order)}"
        + (order.NeedsReview ? "\nהכתובת מחוץ לאזור השירות: ההזמנה ממתינה לאישור שלך." : "");

    private static string Details(Order order)
    {
        var lines = new List<string>
        {
            $"הזמנה #{order.Id} · {order.SupplyDate.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture)} · "
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

    private static string Number(decimal value) => value.ToString("0.###", CultureInfo.InvariantCulture);

    private static string Money(decimal value) => value.ToString("0.##", CultureInfo.InvariantCulture);
}
