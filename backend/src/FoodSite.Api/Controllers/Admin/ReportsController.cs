using System.Globalization;
using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Reports;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FoodSite.Api.Controllers.Admin;

/// <summary>
/// Dishes sold and total sales per week (Sunday to Saturday), by supply date.
/// Cancelled orders and orders waiting for approval are never counted. Every filter is optional.
/// </summary>
[Route("api/admin/reports")]
public class ReportsController(AppDbContext db) : AdminControllerBase
{
    public record DishSalesDto(int DishId, string DishName, decimal Quantity, decimal Sales);

    public record WeekDto(DateOnly WeekStart, int Orders, decimal Sales, IReadOnlyList<DishSalesDto> Dishes);

    public record ReportDto(
        int Orders, decimal Sales, IReadOnlyList<WeekDto> Weeks, IReadOnlyList<DishSalesDto> Dishes);

    private record Line(int OrderId, DateOnly SupplyDate, int DishId, string DishName, decimal Quantity, decimal LineTotal);

    [HttpGet]
    public async Task<ReportDto> Get(DateOnly? from, DateOnly? to, int? dishId, int? categoryId, PaymentMethod? paymentMethod) =>
        Build(await LoadAsync(from, to, dishId, categoryId, paymentMethod));

    [HttpGet("export")]
    public async Task<IActionResult> Export(DateOnly? from, DateOnly? to, int? dishId, int? categoryId, PaymentMethod? paymentMethod)
    {
        var report = Build(await LoadAsync(from, to, dishId, categoryId, paymentMethod));
        var weeks = new Sheet(
            "לפי שבוע",
            ["תחילת שבוע", "מנה", "כמות", "מכירות (₪)"],
            report.Weeks.SelectMany(w => w.Dishes.Select(d =>
                new object?[] { Date(w.WeekStart), d.DishName, d.Quantity, d.Sales })).ToList());
        var totals = new Sheet(
            "סיכום שבועי",
            ["תחילת שבוע", "הזמנות", "מכירות (₪)"],
            report.Weeks.Select(w => new object?[] { Date(w.WeekStart), w.Orders, w.Sales }).ToList());
        var dishes = new Sheet(
            "לפי מנה",
            ["מנה", "כמות", "מכירות (₪)"],
            report.Dishes.Select(d => new object?[] { d.DishName, d.Quantity, d.Sales }).ToList());

        return File(XlsxWriter.Write([totals, weeks, dishes]), XlsxWriter.ContentType, "kuskus-report.xlsx");
    }

    private async Task<List<Line>> LoadAsync(DateOnly? from, DateOnly? to, int? dishId, int? categoryId, PaymentMethod? paymentMethod)
    {
        var query = db.OrderItems.AsNoTracking().Where(i => i.Order!.Status != OrderStatus.Cancelled && !i.Order.NeedsReview);
        if (from is { } start) query = query.Where(i => i.Order!.SupplyDate >= start);
        if (to is { } end) query = query.Where(i => i.Order!.SupplyDate <= end);
        if (dishId is { } dish) query = query.Where(i => i.DishId == dish);
        if (categoryId is { } category) query = query.Where(i => i.Dish!.CategoryId == category);
        if (paymentMethod is { } method) query = query.Where(i => i.Order!.PaymentMethod == method);

        return await query
            .Select(i => new Line(i.OrderId, i.Order!.SupplyDate, i.DishId, i.DishName, i.Quantity, i.LineTotal))
            .ToListAsync();
    }

    private static ReportDto Build(List<Line> lines)
    {
        var weeks = lines
            .GroupBy(l => WeekStart(l.SupplyDate))
            .OrderBy(g => g.Key)
            .Select(g => new WeekDto(g.Key, g.Select(l => l.OrderId).Distinct().Count(), g.Sum(l => l.LineTotal), ByDish(g)))
            .ToList();
        return new ReportDto(lines.Select(l => l.OrderId).Distinct().Count(), lines.Sum(l => l.LineTotal), weeks, ByDish(lines));
    }

    private static List<DishSalesDto> ByDish(IEnumerable<Line> lines) => lines
        .GroupBy(l => l.DishId)
        .Select(g => new DishSalesDto(
            g.Key, g.OrderByDescending(l => l.SupplyDate).First().DishName, g.Sum(l => l.Quantity), g.Sum(l => l.LineTotal)))
        .OrderByDescending(d => d.Sales).ThenBy(d => d.DishName, StringComparer.Ordinal)
        .ToList();

    internal static DateOnly WeekStart(DateOnly date) => date.AddDays(-(int)date.DayOfWeek);

    private static string Date(DateOnly date) => date.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
}
