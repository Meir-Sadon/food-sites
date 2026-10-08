using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace FoodSite.Api.Orders;

/// <summary>
/// The site's limit on portions per supply date (<see cref="Settings.PortionsPerSupplyDate"/>), shared by all dishes:
/// every dish sold by units that is neither a side dish nor add-on only counts. Cancelled orders and orders waiting
/// for the admin's approval don't.
/// </summary>
public static class DailyPortions
{
    public static bool Counts(Dish dish) => dish.SellBy == SellBy.Units && !dish.IsSideDish && !dish.IsAddOnOnly;

    /// <summary>The portions already ordered on each of <paramref name="dates"/> that has any.</summary>
    public static Task<Dictionary<DateOnly, decimal>> TakenAsync(
        AppDbContext db, IReadOnlyCollection<DateOnly> dates, CancellationToken ct = default) =>
        db.OrderItems.AsNoTracking()
            .Where(i => dates.Contains(i.Order!.SupplyDate) && i.Order.Status != OrderStatus.Cancelled && !i.Order.NeedsReview
                && i.Dish!.SellBy == SellBy.Units && !i.Dish.IsSideDish && !i.Dish.IsAddOnOnly)
            .GroupBy(i => i.Order!.SupplyDate)
            .Select(g => new { Date = g.Key, Quantity = g.Sum(i => i.Quantity) })
            .ToDictionaryAsync(g => g.Date, g => g.Quantity, ct);
}
