using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Orders;
using FoodSite.Api.Sites;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace FoodSite.Api.Controllers;

/// <summary>What the client site shows: site info, contact details, the enabled features, the menu and the open supply dates.</summary>
[Route("api")]
public class PublicController(AppDbContext db, SiteClock clock, FeatureFlags features, IOptions<SiteOptions> site) : PublicControllerBase
{
    public record ContactDto(string? Name, string? Phone, string? Address, string? Email, string? OpeningHours);

    public record SiteDto(
        string? BackgroundImageUrl,
        bool DeliveryEnabled,
        bool PickupEnabled,
        string? DeliveryAreaText,
        string? DeliveryFeeText,
        string? KashrutText,
        string? PaymentPhone,
        decimal? MinimumOrderAmount,
        bool MinimumOrderAppliesToPickup,
        ContactDto Contact,
        IReadOnlyList<string> WhatsAppPhones,
        IReadOnlyList<string> ServiceCities,
        IReadOnlyList<string> Features,
        string Style);

    public record MenuOptionDto(int Id, string Label, decimal Amount, decimal Price, bool IsDefault);

    public record MenuDishDto(
        int Id,
        string Name,
        int CategoryId,
        string? Description,
        string? AllergenInfo,
        SellBy SellBy,
        ChoiceMode ChoiceMode,
        decimal? MinAmount,
        decimal? MaxAmount,
        decimal? AmountStep,
        decimal? UnitPrice,
        bool IsAddOnOnly,
        bool IsSoldOut,
        IReadOnlyList<MenuOptionDto> Options,
        IReadOnlyList<string> Images,
        IReadOnlyList<int> AddOnDishIds,
        IReadOnlyDictionary<string, decimal>? Remaining = null,
        bool OpenByDefault = false,
        bool IsSideDish = false,
        string? UnitName = null);

    public record MenuCategoryDto(int Id, string Name);

    /// <summary>
    /// A date the client can order for, when ordering for it closes (local time), and the hours they can ask for
    /// (empty when the day has no supply hours). How full an hour is stays hidden until one is picked.
    /// </summary>
    public record SupplyDateDto(DateOnly Date, DateTime Cutoff, IReadOnlyList<SupplyCalendar.HourSlot>? Hours = null);

    /// <summary>Whether an hour already has as many orders as the site supplies in an hour. Picking it is still allowed.</summary>
    public record HourAvailabilityDto(bool Full);

    public record MenuDto(
        IReadOnlyList<MenuCategoryDto> Categories,
        IReadOnlyList<MenuDishDto> Dishes,
        IReadOnlyList<SupplyDateDto> SupplyDates);

    [HttpGet("site")]
    public async Task<SiteDto> GetSite()
    {
        var s = await db.Settings.AsNoTracking().SingleAsync();
        var whatsAppPhones = await db.NotifyPhones.AsNoTracking().OrderBy(p => p.Id).Select(p => p.Phone).ToListAsync();
        return new SiteDto(
            s.BackgroundImageUrl, s.DeliveryEnabled, s.PickupEnabled, s.DeliveryAreaText, s.DeliveryFeeText,
            s.KashrutText, s.PaymentPhone, s.MinimumOrderAmount, s.MinimumOrderAppliesToPickup,
            new ContactDto(s.ContactName, s.ContactPhone, s.ContactAddress, s.ContactEmail, s.ContactOpeningHours),
            whatsAppPhones,
            ServiceArea.Parse(s.ServiceCities),
            await features.EnabledAsync(),
            SiteStyles.Effective(s.SiteStyle, site.Value.Settings.Style));
    }

    [HttpGet("menu")]
    public async Task<MenuDto> GetMenu()
    {
        var categories = await db.Categories.AsNoTracking()
            .Where(c => !c.IsHidden).OrderBy(c => c.DisplayOrder)
            .Select(c => new MenuCategoryDto(c.Id, c.Name)).ToListAsync();
        var visible = categories.Select(c => c.Id).ToHashSet();

        var dishes = await db.Dishes.AsNoTracking()
            .Include(d => d.Options).Include(d => d.Images).Include(d => d.AddOns)
            .AsSplitQuery()
            .Where(d => !d.IsHidden)
            .OrderBy(d => d.DisplayOrder).ThenBy(d => d.Id)
            .ToListAsync();
        // Category by category, each in the admin's order; add-on-only dishes of a removed category come last.
        var categoryPosition = categories.Select((c, i) => (c.Id, i)).ToDictionary(p => p.Id, p => p.i);
        var shown = dishes.Where(d => visible.Contains(d.CategoryId) || d.IsAddOnOnly)
            .OrderBy(d => categoryPosition.GetValueOrDefault(d.CategoryId, int.MaxValue)).ToList();
        var shownIds = shown.Select(d => d.Id).ToHashSet();
        var dishPosition = shown.Select((d, i) => (d.Id, i)).ToDictionary(p => p.Id, p => p.i);

        var supplyDates = await OpenDatesAsync();
        var remaining = await RemainingAsync(shown, supplyDates.Select(d => d.Date).ToList());

        var menuDishes = shown.Select(d => new MenuDishDto(
            d.Id, d.Name, d.CategoryId, d.Description, d.AllergenInfo, d.SellBy, d.ChoiceMode,
            d.MinAmount, d.MaxAmount, d.AmountStep, d.UnitPrice, d.IsAddOnOnly, d.IsSoldOut,
            d.Options.OrderBy(o => o.Id).Select(o => new MenuOptionDto(o.Id, o.Label, o.Amount, o.Price, o.IsDefault)).ToList(),
            d.Images.OrderBy(i => i.DisplayOrder).Select(i => i.Url).ToList(),
            d.AddOns.Select(a => a.AddOnDishId).Where(shownIds.Contains).OrderBy(id => dishPosition[id]).ToList(),
            remaining.GetValueOrDefault(d.Id), d.OpenByDefault, d.IsSideDish, d.UnitName))
            .ToList();

        return new MenuDto(categories, menuDishes, supplyDates.Select(d => new SupplyDateDto(d.Date, d.Cutoff, d.Hours)).ToList());
    }

    /// <summary>Asked when the client picks an hour, so a full one gets a note; the menu never says which hours are full.</summary>
    [HttpGet("hour-availability")]
    public async Task<HourAvailabilityDto> HourAvailability(DateOnly date, TimeOnly hour)
    {
        var limit = await db.Settings.AsNoTracking().Select(s => s.OrdersPerHour).SingleAsync();
        if (limit is null)
            return new HourAvailabilityDto(false);
        var taken = await db.Orders.AsNoTracking().InSlot(date, hour).CountAsync();
        return new HourAvailabilityDto(HourCapacity.IsFull(taken, limit));
    }

    /// <summary>
    /// For each limited dish, how much is still free on each open supply date (cancelled orders and orders waiting for
    /// the admin's approval don't count). With a site-wide portion limit, every dish it counts is limited by what is left of it too.
    /// </summary>
    private async Task<Dictionary<int, IReadOnlyDictionary<string, decimal>>> RemainingAsync(
        List<Dish> dishes, List<DateOnly> dates)
    {
        if (dates.Count == 0)
            return [];
        var portions = await db.Settings.AsNoTracking().Select(s => s.PortionsPerSupplyDate).SingleAsync();
        var limits = dishes.Where(d => d.MaxPerSupplyDate is not null).ToDictionary(d => d.Id, d => d.MaxPerSupplyDate!.Value);
        var counted = portions is null ? [] : dishes.Where(DailyPortions.Counts).Select(d => d.Id).ToHashSet();
        if (limits.Count == 0 && counted.Count == 0)
            return [];

        var ids = limits.Keys.ToList();
        var taken = await db.OrderItems.AsNoTracking()
            .Where(i => ids.Contains(i.DishId) && dates.Contains(i.Order!.SupplyDate) && i.Order.Status != OrderStatus.Cancelled && !i.Order.NeedsReview)
            .GroupBy(i => new { i.DishId, i.Order!.SupplyDate })
            .Select(g => new { g.Key.DishId, g.Key.SupplyDate, Quantity = g.Sum(i => i.Quantity) })
            .ToListAsync();
        var portionsTaken = counted.Count == 0 ? [] : await DailyPortions.TakenAsync(db, dates);

        decimal? Free(int dishId, DateOnly date)
        {
            decimal? free = limits.TryGetValue(dishId, out var limit)
                ? limit - taken.Where(t => t.DishId == dishId && t.SupplyDate == date).Sum(t => t.Quantity)
                : null;
            if (counted.Contains(dishId))
            {
                var portionsFree = portions!.Value - portionsTaken.GetValueOrDefault(date);
                free = free is null ? portionsFree : Math.Min(free.Value, portionsFree);
            }
            return free is null ? null : Math.Max(0, free.Value);
        }

        return limits.Keys.Union(counted).ToDictionary(
            id => id,
            id => (IReadOnlyDictionary<string, decimal>)dates.ToDictionary(
                date => date.ToString("yyyy-MM-dd"),
                date => Free(id, date)!.Value));
    }

    private async Task<IReadOnlyList<SupplyCalendar.OpenDate>> OpenDatesAsync()
    {
        var days = await db.SupplyDays.AsNoTracking().ToListAsync();
        var closed = await db.ClosedDates.AsNoTracking().Select(c => c.Date).ToListAsync();
        return SupplyCalendar.OpenDates(clock.NowLocal(), days, closed);
    }
}
