using FoodSite.Api.Data.Entities;
using FoodSite.Api.Mail;

namespace FoodSite.Api.Tests;

public class OwnerMessagesTests
{
    [Fact]
    public void The_new_order_mail_lists_everything_about_the_order_and_links_to_it_in_the_admin()
    {
        var main = new OrderItem
        {
            Id = 1, DishName = "עוף בתנור", OptionLabel = "שלם", Note = "בלי מלח", Quantity = 2, UnitPrice = 70, LineTotal = 140,
            Answers = [new OrderItemAnswer { Question = "חריפות", Answer = "בינוני" }],
        };
        var addOn = new OrderItem { Id = 2, DishName = "ירך", OptionLabel = "יחידה", Quantity = 3, UnitPrice = 12, LineTotal = 36, ParentItem = main };
        main.AddOnItems.Add(addOn);
        var order = new Order
        {
            Id = 12, Phone = "050-123-4567", Name = "דנה <b>", Address = "הרצל 1, אשקלון", SupplyDate = new DateOnly(2030, 1, 6),
            DeliveryHour = new TimeOnly(9, 0), FulfillmentMethod = FulfillmentMethod.Delivery, PaymentMethod = PaymentMethod.PayBox,
            Notes = "להתקשר לפני", Total = 176, Items = [main, addOn],
        };

        var mail = OwnerMessages.NewOrder(order, "הבית של אמא", true, "https://shop.example/admin/orders/12");

        Assert.Equal("הזמנה חדשה #12 מאת דנה <b>", mail.Subject);
        foreach (var part in new[]
        {
            "הבית של אמא", "050-123-4567", "06/01/2030", "09:00", "הרצל 1, אשקלון", "העברה ב־PayBox", "2 × עוף בתנור (שלם) – ₪140", "(₪70 ליחידה)",
            "בלי מלח", "חריפות: בינוני", "+ 3 × ירך (יחידה) – ₪36", "להתקשר לפני", "סה״כ: ₪176", "השעה שנבחרה כבר מלאה",
            "https://shop.example/admin/orders/12",
        })
        {
            Assert.Contains(part, mail.Text);
            Assert.Contains(System.Net.WebUtility.HtmlEncode(part), mail.Html);
        }
        Assert.Contains("href=\"https://shop.example/admin/orders/12\"", mail.Html);
        Assert.DoesNotContain("<b>", mail.Html);

        Assert.DoesNotContain("admin/orders", OwnerMessages.NewOrder(order, null, false).Text);
    }
}
