using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Delivery;
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
        bool BitEnabled,
        bool PayBoxEnabled,
        decimal? MinimumOrderAmount,
        bool MinimumOrderAppliesToPickup,
        ContactDto Contact,
        IReadOnlyList<string> WhatsAppPhones,
        IReadOnlyList<string> ServiceCities,
        IReadOnlyList<string> Features,
        string Style,
        string OrderTotalPosition,
        string OrderFlow,
        string Corners,
        string Palette,
        IReadOnlyDictionary<string, string> CustomColors,
        int? LineWidth,
        string Font,
        string Shadows,
        string Spacing,
        string TileGroups,
        string DeliveryPricing = "simple",
        decimal? DeliveryFeeAmount = null,
        bool AddressFirst = false,
        Tracking.Ids? Tracking = null);

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
        string? UnitName = null,
        int? MainDishId = null,
        bool IsYesNo = false,
        IReadOnlyList<MenuAddOnDto>? AddOns = null,
        IReadOnlyList<MenuAddOnGroupDto>? AddOnGroups = null,
        IReadOnlyList<MenuQuestionDto>? Questions = null,
        bool AdjustmentOptional = false,
        string? OptionsTitle = null,
        bool ShowOptionDifference = false,
        IReadOnlyList<string>? DietaryTags = null);

    /// <summary>A question the client answers when ordering the dish (a variant's main dish's first, then its own).</summary>
    /// <summary>DefaultAnswer is the answer already picked for the client (a choice, or yes / no), if the admin set one.</summary>
    public record MenuQuestionDto(
        int Id, string Text, QuestionKind Kind, IReadOnlyList<string> Choices, bool ShowAsDropdown, bool IsRequired,
        string? DefaultAnswer = null);

    /// <summary>
    /// How an add-on is offered under this dish (the same order as AddOnDishIds). Price, when set, is its price per unit
    /// here, in its default option only; MaxQuantity caps it under one ordered line; a check box is added or not.
    /// </summary>
    public record MenuAddOnDto(int DishId, int? GroupId, decimal? Price, decimal? MaxQuantity, bool IsCheckbox);

    /// <summary>A heading over some of the dish's add-ons, and the most units the client can pick from them together.</summary>
    public record MenuAddOnGroupDto(int Id, string Name, int? MaxUnits);

    public record MenuCategoryDto(int Id, string Name);

    /// <summary>A custom group of dishes (such as "מומלצות"), shown in its own section; DishIds are in menu order.</summary>
    public record MenuGroupDto(int Id, string Name, IReadOnlyList<int> DishIds);

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
        IReadOnlyList<SupplyDateDto> SupplyDates,
        IReadOnlyList<MenuGroupDto>? Groups = null);

    private static bool PaymentOn(Data.Entities.Settings s) => !string.IsNullOrWhiteSpace(s.PaymentPhone);

    [HttpGet("site")]
    public async Task<SiteDto> GetSite()
    {
        var s = await db.Settings.AsNoTracking().SingleAsync();
        var whatsAppPhones = await db.NotifyPhones.AsNoTracking().OrderBy(p => p.Id).Select(p => p.Phone).ToListAsync();
        return new SiteDto(
            s.BackgroundImageUrl, s.DeliveryEnabled, s.PickupEnabled, s.DeliveryAreaText, s.DeliveryFeeText,
            s.KashrutText, s.PaymentPhone, s.BitEnabled && PaymentOn(s), s.PayBoxEnabled && PaymentOn(s), s.MinimumOrderAmount, s.MinimumOrderAppliesToPickup,
            new ContactDto(s.ContactName, s.ContactPhone, s.ContactAddress, s.ContactEmail, s.ContactOpeningHours),
            whatsAppPhones,
            ServiceArea.Parse(s.ServiceCities),
            await features.EnabledAsync(),
            SiteStyles.Effective(s.SiteStyle, site.Value.Settings.Style),
            OrderLayout.EffectiveTotalPosition(s.OrderTotalPosition, site.Value.Settings.OrderTotalPosition),
            OrderLayout.EffectiveFlow(s.OrderFlow, site.Value.Settings.OrderFlow),
            Sites.Corners.Effective(s.Corners, site.Value.Settings.Corners),
            Palettes.Effective(s.Palette, site.Value.Settings.Palette),
            Palettes.Parse(s.CustomColors),
            s.LineWidth,
            Finish.Effective(s.FontPair, Finish.IsKnownFont),
            Finish.Effective(s.ShadowStrength, Finish.IsKnownShadows),
            Finish.Effective(s.Spacing, Finish.IsKnownSpacing),
            Finish.EffectiveTileGroups(s.TileGroups),
            DeliveryQuoter.Mode(s),
            s.DeliveryFeeAmount,
            s.AddressFirst,
            Sites.Tracking.Of(s));
    }

    [HttpGet("menu")]
    public async Task<MenuDto> GetMenu()
    {
        var categories = await db.Categories.AsNoTracking()
            .Where(c => !c.IsHidden).OrderBy(c => c.DisplayOrder)
            .Select(c => new MenuCategoryDto(c.Id, c.Name)).ToListAsync();
        var visible = categories.Select(c => c.Id).ToHashSet();

        var dishes = await db.Dishes.AsNoTracking()
            .Include(d => d.Options).Include(d => d.Images).Include(d => d.Questions).Include(d => d.AddOns).ThenInclude(a => a.Group)
            .AsSplitQuery()
            .Where(d => !d.IsHidden)
            .OrderBy(d => d.DisplayOrder).ThenBy(d => d.Id)
            .ToListAsync();
        // A variant is shown with its main dish (priced like it when set), and not at all when the main dish is removed.
        var byId = dishes.ToDictionary(d => d.Id);
        foreach (var variant in dishes.Where(d => d.MainDishId is not null))
            variant.MainDish = byId.GetValueOrDefault(variant.MainDishId!.Value);
        // Category by category, each in the admin's order; add-on-only dishes of a removed category come last.
        var categoryPosition = categories.Select((c, i) => (c.Id, i)).ToDictionary(p => p.Id, p => p.i);
        var shown = dishes.Where(d => d.MainDishId is null || d.MainDish is not null)
            .Where(d => visible.Contains(d.CategoryId) || d.IsAddOnOnly)
            .OrderBy(d => categoryPosition.GetValueOrDefault(d.CategoryId, int.MaxValue)).ToList();
        var shownIds = shown.Select(d => d.Id).ToHashSet();
        var dishPosition = shown.Select((d, i) => (d.Id, i)).ToDictionary(p => p.Id, p => p.i);

        var supplyDates = await OpenDatesAsync();
        var remaining = await RemainingAsync(shown, supplyDates.Select(d => d.Date).ToList());

        var menuDishes = shown.Select(d =>
        {
            var p = DishRules.Pricing(d);
            var links = DishRules.AddOnLinks(d).Where(a => shownIds.Contains(a.AddOnDishId))
                .OrderBy(a => a.Group?.DisplayOrder ?? int.MaxValue).ThenBy(a => a.DisplayOrder).ThenBy(a => dishPosition[a.AddOnDishId])
                .ToList();
            return new MenuDishDto(
                d.Id, d.Name, d.CategoryId, d.Description, d.AllergenInfo, p.SellBy, p.ChoiceMode,
                p.MinAmount, p.MaxAmount, p.AmountStep, p.UnitPrice, d.IsAddOnOnly, d.IsSoldOut || d.MainDish is { IsSoldOut: true },
                p.Options.OrderBy(o => o.Id).Select(o => new MenuOptionDto(o.Id, o.Label, o.Amount, o.Price, o.IsDefault)).ToList(),
                d.Images.OrderBy(i => i.DisplayOrder).Select(i => i.Url).ToList(),
                links.Select(a => a.AddOnDishId).ToList(),
                remaining.GetValueOrDefault(d.Id), d.OpenByDefault, d.IsSideDish, p.UnitName,
                d.MainDishId, d.IsYesNo,
                links.Select(a => new MenuAddOnDto(a.AddOnDishId, a.GroupId, a.Price, a.MaxQuantity, a.IsCheckbox)).ToList(),
                links.Where(a => a.Group is not null).Select(a => a.Group!).DistinctBy(g => g.Id)
                    .Select(g => new MenuAddOnGroupDto(g.Id, g.Name, g.MaxUnits)).ToList(),
                DishRules.Questions(d)
                    .Select(q => new MenuQuestionDto(q.Id, q.Text, q.Kind, q.Choices, q.ShowAsDropdown, q.IsRequired, q.DefaultAnswer)).ToList(),
                (d.MainDish ?? d).AdjustmentOptional,
                p.OptionsTitle, p.ShowOptionDifference, d.DietaryTags);
        }).ToList();

        // Groups list only dishes ordered on their own that are on the menu, in menu order; an empty group is left out.
        var standalone = shown.Where(d => !d.IsAddOnOnly && d.MainDishId is null && visible.Contains(d.CategoryId)).Select(d => d.Id).ToList();
        var groupRows = await db.DishGroups.AsNoTracking().Include(g => g.Dishes)
            .OrderBy(g => g.DisplayOrder).ThenBy(g => g.Id).ToListAsync();
        var groups = groupRows
            .Select(g => new MenuGroupDto(g.Id, g.Name, standalone.Where(id => g.Dishes.Any(x => x.DishId == id)).ToList()))
            .Where(g => g.DishIds.Count > 0).ToList();

        return new MenuDto(categories, menuDishes, supplyDates.Select(d => new SupplyDateDto(d.Date, d.Cutoff, d.Hours)).ToList(), groups);
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
