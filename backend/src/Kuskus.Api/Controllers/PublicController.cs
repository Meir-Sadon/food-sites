using Kuskus.Api.Data;
using Kuskus.Api.Data.Entities;
using Kuskus.Api.Orders;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Kuskus.Api.Controllers;

/// <summary>What the client site shows: site info, contact details, the menu and the open supply dates.</summary>
[Route("api")]
public class PublicController(AppDbContext db, SiteClock clock) : PublicControllerBase
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
        ContactDto Contact);

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
        bool OpenByDefault = false);

    public record MenuCategoryDto(int Id, string Name);

    /// <summary>A date the client can order for, and when ordering for it closes (local time).</summary>
    public record SupplyDateDto(DateOnly Date, DateTime Cutoff);

    public record MenuDto(
        IReadOnlyList<MenuCategoryDto> Categories,
        IReadOnlyList<MenuDishDto> Dishes,
        IReadOnlyList<SupplyDateDto> SupplyDates);

    [HttpGet("site")]
    public async Task<SiteDto> GetSite()
    {
        var s = await db.Settings.AsNoTracking().SingleAsync();
        return new SiteDto(
            s.BackgroundImageUrl, s.DeliveryEnabled, s.PickupEnabled, s.DeliveryAreaText, s.DeliveryFeeText,
            s.KashrutText, s.PaymentPhone, s.MinimumOrderAmount,
            new ContactDto(s.ContactName, s.ContactPhone, s.ContactAddress, s.ContactEmail, s.ContactOpeningHours));
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
            .OrderBy(d => d.Id)
            .ToListAsync();
        var shown = dishes.Where(d => visible.Contains(d.CategoryId) || d.IsAddOnOnly).ToList();
        var shownIds = shown.Select(d => d.Id).ToHashSet();

        var supplyDates = await OpenDatesAsync();
        var remaining = await RemainingAsync(shown, supplyDates.Select(d => d.Date).ToList());

        var menuDishes = shown.Select(d => new MenuDishDto(
            d.Id, d.Name, d.CategoryId, d.Description, d.AllergenInfo, d.SellBy, d.ChoiceMode,
            d.MinAmount, d.MaxAmount, d.AmountStep, d.UnitPrice, d.IsAddOnOnly, d.IsSoldOut,
            d.Options.OrderBy(o => o.Id).Select(o => new MenuOptionDto(o.Id, o.Label, o.Amount, o.Price, o.IsDefault)).ToList(),
            d.Images.OrderBy(i => i.DisplayOrder).Select(i => i.Url).ToList(),
            d.AddOns.Select(a => a.AddOnDishId).Where(shownIds.Contains).Order().ToList(),
            remaining.GetValueOrDefault(d.Id), d.OpenByDefault))
            .ToList();

        return new MenuDto(categories, menuDishes, supplyDates.Select(d => new SupplyDateDto(d.Date, d.Cutoff)).ToList());
    }

    /// <summary>For each limited dish, how much is still free on each open supply date (cancelled orders and orders waiting for the admin's approval don't count).</summary>
    private async Task<Dictionary<int, IReadOnlyDictionary<string, decimal>>> RemainingAsync(
        List<Dish> dishes, List<DateOnly> dates)
    {
        var limits = dishes.Where(d => d.MaxPerSupplyDate is not null).ToDictionary(d => d.Id, d => d.MaxPerSupplyDate!.Value);
        if (limits.Count == 0 || dates.Count == 0)
            return [];

        var ids = limits.Keys.ToList();
        var taken = await db.OrderItems.AsNoTracking()
            .Where(i => ids.Contains(i.DishId) && dates.Contains(i.Order!.SupplyDate) && i.Order.Status != OrderStatus.Cancelled && !i.Order.NeedsReview)
            .GroupBy(i => new { i.DishId, i.Order!.SupplyDate })
            .Select(g => new { g.Key.DishId, g.Key.SupplyDate, Quantity = g.Sum(i => i.Quantity) })
            .ToListAsync();

        return limits.ToDictionary(
            l => l.Key,
            l => (IReadOnlyDictionary<string, decimal>)dates.ToDictionary(
                date => date.ToString("yyyy-MM-dd"),
                date => Math.Max(0, l.Value - taken
                    .Where(t => t.DishId == l.Key && t.SupplyDate == date).Sum(t => t.Quantity))));
    }

    private async Task<IReadOnlyList<SupplyCalendar.OpenDate>> OpenDatesAsync()
    {
        var days = await db.SupplyDays.AsNoTracking().ToListAsync();
        var closed = await db.ClosedDates.AsNoTracking().Select(c => c.Date).ToListAsync();
        return SupplyCalendar.OpenDates(clock.NowLocal(), days, closed);
    }
}
