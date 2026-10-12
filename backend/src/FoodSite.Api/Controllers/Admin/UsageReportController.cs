using FoodSite.Api.Orders;
using FoodSite.Api.Usage;
using Microsoft.AspNetCore.Mvc;

namespace FoodSite.Api.Controllers.Admin;

/// <summary>
/// How the client site is used between two dates (the business's days, both included): devices that visited,
/// started an order and sent one, registered clients, returning customers, and helper numbers from the orders.
/// Devices are counted once each over the whole range while their events are kept; for days before that only
/// daily counts remain, so a device that came on two of those days counts twice and the answer says so.
/// Orders are counted by the day they were sent; cancelled orders never count.
/// </summary>
[Route("api/admin/usage")]
public class UsageReportController(SiteClock clock, UsageReportBuilder builder) : AdminControllerBase
{
    public const int MaxDays = 366;
    public const int TopDishesCount = 10;

    public record FunnelDto(int Visitors, int NewVisitors, int Started, int Submitted);

    public record DayDto(DateOnly Day, int Visitors, int Started, int Submitted, int Orders);

    public record OrdersDto(
        int Orders, decimal Sales, decimal AverageOrder, int Customers, int ReturningCustomers,
        int NewCustomerOrders, int ReturningCustomerOrders);

    public record RegisteredDto(int Total, int New);

    public record DishDto(string DishName, decimal Quantity, decimal Sales);

    public record UsageReportDto(
        DateOnly From,
        DateOnly To,
        /// <summary>True when the range starts before <see cref="KeptSince"/>: a device seen on several of those days counts more than once.</summary>
        bool Approximate,
        DateOnly KeptSince,
        int TotalDevices,
        FunnelDto Funnel,
        RegisteredDto Registered,
        OrdersDto Orders,
        IReadOnlyList<DayDto> Days,
        /// <summary>Orders per weekday, Sunday first.</summary>
        IReadOnlyList<int> OrdersByWeekday,
        /// <summary>Orders per hour of the day they were sent, 0 to 23.</summary>
        IReadOnlyList<int> OrdersByHour,
        IReadOnlyList<DishDto> TopDishes);

    [HttpGet]
    public async Task<ActionResult<UsageReportDto>> Get(DateOnly? from, DateOnly? to, CancellationToken ct)
    {
        var end = to ?? clock.Today();
        var start = from ?? end.AddDays(-29);
        if (start > end)
            return Invalid(nameof(from), "range");
        if (end.DayNumber - start.DayNumber + 1 > MaxDays)
            return Invalid(nameof(to), "rangeTooLong");

        return await builder.BuildAsync(start, end, ct);
    }
}
