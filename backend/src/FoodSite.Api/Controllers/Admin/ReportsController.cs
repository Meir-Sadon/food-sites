using System.Globalization;
using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Reports;
using FoodSite.Api.Sites;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace FoodSite.Api.Controllers.Admin;

/// <summary>
/// Dishes sold and total sales per week (Sunday to Saturday), by supply date.
/// Cancelled orders and orders waiting for approval are never counted. Every filter is optional.
/// </summary>
[Route("api/admin/reports")]
public class ReportsController(AppDbContext db, IOptions<SiteOptions> site) : AdminControllerBase
{
    /// <param name="RegularSales">What the same units would have cost at their regular prices (equals Sales when no discount applied).</param>
    /// <param name="PriceLists">The price lists the sales came from; null stands for the default (base) list.</param>
    public record DishSalesDto(
        int DishId, string DishName, decimal Quantity, decimal Sales, decimal RegularSales, IReadOnlyList<string?> PriceLists);

    /// <summary>Sales by price list (null Name is the default list): units, what was charged and what it would have been at regular prices.</summary>
    public record ListSalesDto(string? Name, int Orders, decimal Quantity, decimal Sales, decimal RegularSales);

    public record WeekDto(DateOnly WeekStart, int Orders, decimal Sales, IReadOnlyList<DishSalesDto> Dishes);

    /// <param name="ListDiscount">The total taken off by price lists and the dishes' own discounts (RegularSales less Sales).</param>
    /// <param name="DeliveryDiscount">The total taken off delivery fees by the large-order discount.</param>
    public record ReportDto(
        int Orders, decimal Sales, IReadOnlyList<WeekDto> Weeks, IReadOnlyList<DishSalesDto> Dishes,
        IReadOnlyList<ListSalesDto> Lists, decimal ListDiscount, decimal DeliveryDiscount);

    private record Line(
        int OrderId, DateOnly SupplyDate, int DishId, string DishName, decimal Quantity, decimal LineTotal, string? PriceListName,
        decimal? RegularUnitPrice)
    {
        public decimal RegularTotal => RegularUnitPrice is { } regular ? decimal.Round(regular * Quantity, 2) : LineTotal;
    }

    [HttpGet]
    public async Task<ReportDto> Get(DateOnly? from, DateOnly? to, int? dishId, int? categoryId, PaymentMethod? paymentMethod) =>
        await BuildAsync(from, to, dishId, categoryId, paymentMethod);

    [HttpGet("export")]
    public async Task<IActionResult> Export(DateOnly? from, DateOnly? to, int? dishId, int? categoryId, PaymentMethod? paymentMethod)
    {
        var report = await BuildAsync(from, to, dishId, categoryId, paymentMethod);
        var weeks = new Sheet(
            "לפי שבוע",
            ["תחילת שבוע", "מנה", "כמות", "מכירות (₪)", "במחיר רגיל (₪)", "מחירון"],
            report.Weeks.SelectMany(w => w.Dishes.Select(d =>
                new object?[] { Date(w.WeekStart), d.DishName, d.Quantity, d.Sales, d.RegularSales, ListNames(d) })).ToList());
        var totals = new Sheet(
            "סיכום שבועי",
            ["תחילת שבוע", "הזמנות", "מכירות (₪)"],
            report.Weeks.Select(w => new object?[] { Date(w.WeekStart), w.Orders, w.Sales }).ToList());
        var dishes = new Sheet(
            "לפי מנה",
            ["מנה", "כמות", "מכירות (₪)", "במחיר רגיל (₪)", "מחירון"],
            report.Dishes.Select(d => new object?[] { d.DishName, d.Quantity, d.Sales, d.RegularSales, ListNames(d) }).ToList());
        var lists = new Sheet(
            "לפי מחירון",
            ["מחירון", "הזמנות", "כמות", "מכירות (₪)", "במחיר רגיל (₪)", "הנחה (₪)"],
            report.Lists.Select(l => new object?[] { l.Name ?? DefaultListName, l.Orders, l.Quantity, l.Sales, l.RegularSales, l.RegularSales - l.Sales }).ToList());

        return File(XlsxWriter.Write([totals, weeks, dishes, lists]), XlsxWriter.ContentType, $"{site.Value.Id}-report.xlsx");
    }

    private const string DefaultListName = "מחירון ברירת מחדל";

    private static string ListNames(DishSalesDto dish) => string.Join(", ", dish.PriceLists.Select(n => n ?? DefaultListName));

    private async Task<ReportDto> BuildAsync(DateOnly? from, DateOnly? to, int? dishId, int? categoryId, PaymentMethod? paymentMethod)
    {
        var lines = await LoadAsync(from, to, dishId, categoryId, paymentMethod);
        var orderIds = lines.Select(l => l.OrderId).Distinct().ToList();
        var deliveryDiscount = (await db.Orders.AsNoTracking().Where(o => orderIds.Contains(o.Id)).Select(o => o.DeliveryDiscount).ToListAsync()).Sum();
        return Build(lines, deliveryDiscount);
    }

    private async Task<List<Line>> LoadAsync(DateOnly? from, DateOnly? to, int? dishId, int? categoryId, PaymentMethod? paymentMethod)
    {
        var query = db.OrderItems.AsNoTracking().Where(i => i.Order!.Status != OrderStatus.Cancelled && !i.Order.NeedsReview && !(i.Order.DepositRequired && !i.Order.DepositPaid));
        if (from is { } start) query = query.Where(i => i.Order!.SupplyDate >= start);
        if (to is { } end) query = query.Where(i => i.Order!.SupplyDate <= end);
        if (dishId is { } dish) query = query.Where(i => i.DishId == dish);
        if (categoryId is { } category) query = query.Where(i => i.Dish!.CategoryId == category);
        if (paymentMethod is { } method) query = query.Where(i => i.Order!.PaymentMethod == method);

        return await query
            .Select(i => new Line(i.OrderId, i.Order!.SupplyDate, i.DishId, i.DishName, i.Quantity, i.LineTotal, i.PriceListName, i.RegularUnitPrice))
            .ToListAsync();
    }

    private static ReportDto Build(List<Line> lines, decimal deliveryDiscount = 0m)
    {
        var weeks = lines
            .GroupBy(l => WeekStart(l.SupplyDate))
            .OrderBy(g => g.Key)
            .Select(g => new WeekDto(g.Key, g.Select(l => l.OrderId).Distinct().Count(), g.Sum(l => l.LineTotal), ByDish(g)))
            .ToList();
        var lists = lines.GroupBy(l => l.PriceListName)
            .Select(g => new ListSalesDto(g.Key, g.Select(l => l.OrderId).Distinct().Count(), g.Sum(l => l.Quantity), g.Sum(l => l.LineTotal), g.Sum(l => l.RegularTotal)))
            .OrderBy(l => l.Name is not null).ThenBy(l => l.Name, StringComparer.Ordinal).ToList();
        return new ReportDto(lines.Select(l => l.OrderId).Distinct().Count(), lines.Sum(l => l.LineTotal), weeks, ByDish(lines),
            lists, lines.Sum(l => l.RegularTotal - l.LineTotal), deliveryDiscount);
    }

    private static List<DishSalesDto> ByDish(IEnumerable<Line> lines) => lines
        .GroupBy(l => l.DishId)
        .Select(g => new DishSalesDto(
            g.Key, g.OrderByDescending(l => l.SupplyDate).First().DishName, g.Sum(l => l.Quantity), g.Sum(l => l.LineTotal),
            g.Sum(l => l.RegularTotal), g.Select(l => l.PriceListName).Distinct().OrderBy(n => n is not null).ThenBy(n => n, StringComparer.Ordinal).ToList()))
        .OrderByDescending(d => d.Sales).ThenBy(d => d.DishName, StringComparer.Ordinal)
        .ToList();

    internal static DateOnly WeekStart(DateOnly date) => date.AddDays(-(int)date.DayOfWeek);

    private static string Date(DateOnly date) => date.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
}
