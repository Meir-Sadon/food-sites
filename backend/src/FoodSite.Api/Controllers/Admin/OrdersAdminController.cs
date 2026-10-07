using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Orders;
using FoodSite.Api.Phones;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using static FoodSite.Api.Controllers.Admin.Ordering;

namespace FoodSite.Api.Controllers.Admin;

/// <summary>Orders by supply day: status, payment, edits after a client's call, and the cooking summary.</summary>
[Route("api/admin/orders")]
public class OrdersAdminController(AppDbContext db) : AdminControllerBase
{
    public const int NameMaxLength = 100;
    public const int AddressMaxLength = 300;
    public const int NotesMaxLength = 500;
    public const decimal MaxQuantity = 999;

    public record ItemDto(
        int Id, int? ParentItemId, string DishName, string? OptionLabel, decimal Quantity, decimal UnitPrice, decimal LineTotal);

    public record OrderDto(
        int Id,
        string Phone,
        string Name,
        string Address,
        DateOnly SupplyDate,
        FulfillmentMethod FulfillmentMethod,
        string? Notes,
        PaymentMethod PaymentMethod,
        bool IsPaid,
        OrderStatus Status,
        decimal Total,
        DateTimeOffset CreatedAt,
        bool IsGuest,
        bool NeedsReview,
        IReadOnlyList<ItemDto> Items);

    public record StatusInput(OrderStatus Status);

    public record PaidInput(bool IsPaid);

    public record ItemInput(int Id, decimal Quantity);

    /// <summary>The order's lines to keep, with their new quantities. A line left out is removed, with its add-ons.</summary>
    public record OrderInput(
        string? Name,
        string? Phone,
        string? Address,
        DateOnly SupplyDate,
        FulfillmentMethod FulfillmentMethod,
        PaymentMethod PaymentMethod,
        string? Notes,
        List<ItemInput>? Items);

    public record SummaryRowDto(int DishId, string DishName, string? OptionLabel, decimal Quantity, int Orders);

    /// <summary>
    /// MainDishCount is how many dishes were ordered on their own (units; a free-weight line counts one).
    /// SideDishCount is how many kinds of side dish were ordered on their own, however many of each.
    /// Add-on lines belong to the dish they were ordered under and count in neither.
    /// </summary>
    public record SummaryDto(
        DateOnly Date, int OrderCount, int DeliveryCount, int PickupCount, IReadOnlyList<SummaryRowDto> Rows,
        decimal MainDishCount = 0, int SideDishCount = 0);

    /// <summary>Orders with a supply date in [from, to], newest supply day last. Both bounds and the status are optional.</summary>
    [HttpGet]
    public async Task<IEnumerable<OrderDto>> GetAll(DateOnly? from, DateOnly? to, OrderStatus? status)
    {
        var query = db.Orders.AsNoTracking().Include(o => o.Items).AsSplitQuery().AsQueryable();
        if (from is { } start) query = query.Where(o => o.SupplyDate >= start);
        if (to is { } end) query = query.Where(o => o.SupplyDate <= end);
        if (status is { } s) query = query.Where(o => o.Status == s);

        var orders = await query.OrderBy(o => o.SupplyDate).ThenBy(o => o.CreatedAt).ThenBy(o => o.Id).ToListAsync();
        return orders.Select(ToDto);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<OrderDto>> Get(int id) =>
        await db.Orders.AsNoTracking().Include(o => o.Items).SingleOrDefaultAsync(o => o.Id == id) is { } order
            ? ToDto(order)
            : NotFound();

    /// <summary>The total of each dish and option to cook for one supply day. Cancelled orders and orders still waiting for approval are left out.</summary>
    [HttpGet("summary")]
    public async Task<SummaryDto> Summary(DateOnly date)
    {
        var orders = await db.Orders.AsNoTracking()
            .Where(o => o.SupplyDate == date && o.Status != OrderStatus.Cancelled && !o.NeedsReview)
            .Select(o => new { o.FulfillmentMethod })
            .ToListAsync();
        var lines = await db.OrderItems.AsNoTracking()
            .Where(i => i.Order!.SupplyDate == date && i.Order.Status != OrderStatus.Cancelled && !i.Order.NeedsReview)
            .Select(i => new
            {
                i.DishId, i.DishName, i.OptionLabel, i.Quantity, i.OrderId,
                Standalone = i.ParentItemId == null,
                IsSideDish = i.Dish!.IsSideDish,
                IsFree = i.Dish.ChoiceMode == ChoiceMode.Free,
            })
            .ToListAsync();

        var rows = lines
            .GroupBy(i => (i.DishId, i.DishName, i.OptionLabel))
            .Select(g => new SummaryRowDto(
                g.Key.DishId, g.Key.DishName, g.Key.OptionLabel, g.Sum(i => i.Quantity), g.Select(i => i.OrderId).Distinct().Count()))
            .OrderBy(r => r.DishName, StringComparer.Ordinal).ThenBy(r => r.OptionLabel, StringComparer.Ordinal)
            .ToList();
        return new SummaryDto(
            date, orders.Count,
            orders.Count(o => o.FulfillmentMethod == FulfillmentMethod.Delivery),
            orders.Count(o => o.FulfillmentMethod == FulfillmentMethod.Pickup),
            rows,
            DishesCount(lines.Where(i => i.Standalone && !i.IsSideDish).Select(i => (i.Quantity, i.IsFree))),
            lines.Where(i => i.Standalone && i.IsSideDish).Select(i => i.DishId).Distinct().Count());
    }

    /// <summary>Units for set-option dishes; a free-weight line (quantity in kilos) counts as one dish.</summary>
    private static decimal DishesCount(IEnumerable<(decimal Quantity, bool IsFree)> lines) =>
        lines.Sum(l => l.IsFree ? 1 : l.Quantity);

    [HttpPut("{id:int}/status")]
    public async Task<ActionResult> SetStatus(int id, StatusInput input)
    {
        if (!Enum.IsDefined(input.Status))
            return Invalid(nameof(input.Status), "invalid");
        var updated = await db.Orders.Where(o => o.Id == id)
            .ExecuteUpdateAsync(s => s.SetProperty(o => o.Status, input.Status));
        return updated == 0 ? NotFound() : NoContent();
    }

    /// <summary>The admin accepts an order that was flagged for review: from now on it takes its quantities.</summary>
    [HttpPut("{id:int}/approve")]
    public async Task<ActionResult> Approve(int id)
    {
        var updated = await db.Orders.Where(o => o.Id == id)
            .ExecuteUpdateAsync(s => s.SetProperty(o => o.NeedsReview, false));
        return updated == 0 ? NotFound() : NoContent();
    }

    [HttpPut("{id:int}/paid")]
    public async Task<ActionResult> SetPaid(int id, PaidInput input)
    {
        var updated = await db.Orders.Where(o => o.Id == id)
            .ExecuteUpdateAsync(s => s.SetProperty(o => o.IsPaid, input.IsPaid));
        return updated == 0 ? NotFound() : NoContent();
    }

    /// <summary>
    /// Edits an order after the client called. Names and prices on the lines stay as ordered;
    /// only quantities change, and the total is worked out again.
    /// </summary>
    [HttpPut("{id:int}")]
    public async Task<ActionResult<OrderDto>> Update(int id, OrderInput input)
    {
        var order = await db.Orders.Include(o => o.Items).SingleOrDefaultAsync(o => o.Id == id);
        if (order is null)
            return NotFound();

        var errors = new Errors();
        errors.Text(nameof(input.Name), input.Name, NameMaxLength, required: true);
        errors.Text(nameof(input.Notes), input.Notes, NotesMaxLength);
        var phone = PhoneNumber.Normalize(input.Phone);
        if (phone is null)
            errors.Add(nameof(input.Phone), "phone");
        if (!Enum.IsDefined(input.FulfillmentMethod))
            errors.Add(nameof(input.FulfillmentMethod), "invalid");
        else if (input.FulfillmentMethod == FulfillmentMethod.Delivery)
            errors.Text(nameof(input.Address), input.Address, AddressMaxLength, required: true);
        else
            errors.Text(nameof(input.Address), input.Address, AddressMaxLength);
        if (!Enum.IsDefined(input.PaymentMethod))
            errors.Add(nameof(input.PaymentMethod), "invalid");

        var kept = new Dictionary<int, decimal>();
        foreach (var line in input.Items ?? [])
        {
            if (order.Items.All(i => i.Id != line.Id) || !kept.TryAdd(line.Id, line.Quantity))
                errors.Add("items", "invalid");
            else if (line.Quantity <= 0 || line.Quantity > MaxQuantity || decimal.Round(line.Quantity, 3) != line.Quantity)
                errors.Add("items", "quantityInvalid");
        }
        // An add-on cannot stay without the line it was ordered under.
        if (order.Items.Any(i => i.ParentItemId is { } parent && kept.ContainsKey(i.Id) && !kept.ContainsKey(parent)))
            errors.Add("items", "invalid");
        if (kept.Count == 0)
            errors.Add("items", "emptyOrder");
        if (errors.Any)
            return Invalid(errors);

        order.Name = input.Name!.Trim();
        order.Phone = phone!;
        order.Address = Clean(input.Address) ?? "";
        order.SupplyDate = input.SupplyDate;
        order.FulfillmentMethod = input.FulfillmentMethod;
        order.PaymentMethod = input.PaymentMethod;
        order.Notes = Clean(input.Notes);

        // Add-ons of a removed line were required to be removed with it (checked above).
        var removed = order.Items.Where(i => !kept.ContainsKey(i.Id)).ToList();
        db.OrderItems.RemoveRange(removed);
        foreach (var item in order.Items.Where(i => kept.ContainsKey(i.Id)))
        {
            item.Quantity = kept[item.Id];
            item.LineTotal = decimal.Round(item.UnitPrice * item.Quantity, 2);
        }
        order.Total = order.Items.Where(i => kept.ContainsKey(i.Id)).Sum(i => i.LineTotal);

        // An account holds the orders of its own phone: a changed phone follows the matching account, or none.
        order.UserId = await db.Users.AsNoTracking().Where(u => u.Phone == phone).Select(u => (int?)u.Id).FirstOrDefaultAsync();

        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        return ToDto(await db.Orders.AsNoTracking().Include(o => o.Items).SingleAsync(o => o.Id == id));
    }

    private static OrderDto ToDto(Order o) => new(
        o.Id, o.Phone, o.Name, o.Address, o.SupplyDate, o.FulfillmentMethod, o.Notes, o.PaymentMethod, o.IsPaid,
        o.Status, o.Total, o.CreatedAt, o.UserId is null, o.NeedsReview,
        o.Items.OrderBy(i => i.Id)
            .Select(i => new ItemDto(i.Id, i.ParentItemId, i.DishName, i.OptionLabel, i.Quantity, i.UnitPrice, i.LineTotal))
            .ToList());
}
