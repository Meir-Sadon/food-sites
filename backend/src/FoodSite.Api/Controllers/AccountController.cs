using FoodSite.Api.Auth;
using FoodSite.Api.Controllers.Admin;
using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Orders;
using FoodSite.Api.Phones;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using static FoodSite.Api.Controllers.Admin.Ordering;

namespace FoodSite.Api.Controllers;

/// <summary>
/// Client accounts: login and registration by phone number, the
/// profile, order history, favorites and recommendations. Everything except login,
/// registration and logout needs the client's session cookie.
/// </summary>
[Route("api/account")]
public class AccountController(
    AppDbContext db,
    UserTokenService tokens,
    IOptions<Auth.CookieOptions> cookie,
    TimeProvider time) : PublicControllerBase
{
    public const int NameMaxLength = 100;
    public const int EmailMaxLength = 200;
    public const int EthnicBackgroundMaxLength = 100;
    public const int FavoriteNameMaxLength = 60;
    public const int MaxFavorites = 20;
    public const int RecommendationMaxLength = 1000;
    public const int MaxRecommendationsPerDay = 10;
    public const int HistoryLimit = 100;

    private static readonly DateOnly EarliestBirthday = new(1900, 1, 1);

    public record LoginInput(string? Phone);

    public record ProfileInput(
        string? Phone,
        string? FullName,
        string? City,
        string? Street,
        string? HouseNumber,
        string? Apartment,
        string? Email,
        DateOnly? Birthday,
        string? EthnicBackground);

    public record ProfileDto(
        int Id, string Phone, string FullName, string City, string Street, string HouseNumber, string Apartment,
        string Address, string? Email, DateOnly? Birthday, string? EthnicBackground);

    public record HistoryItemDto(
        int Id, int DishId, int? ParentItemId, string DishName, string? OptionLabel,
        decimal Quantity, decimal UnitPrice, decimal LineTotal);

    public record HistoryOrderDto(
        int Id,
        DateOnly SupplyDate,
        OrderStatus Status,
        FulfillmentMethod FulfillmentMethod,
        PaymentMethod PaymentMethod,
        bool IsPaid,
        decimal Total,
        DateTimeOffset CreatedAt,
        IReadOnlyList<HistoryItemDto> Items);

    public record FavoriteInput(string? Name, int OrderId);

    public record FavoriteAddOnDto(int DishId, int? OptionId, decimal Quantity);

    public record FavoriteItemDto(int DishId, int? OptionId, decimal Quantity, IReadOnlyList<FavoriteAddOnDto> AddOns);

    public record FavoriteDto(int Id, string Name, IReadOnlyList<FavoriteItemDto> Items);

    public record RecommendationInput(string? Text);

    public record RecommendationDto(int Id, string Text, DateTimeOffset CreatedAt, bool IsHandled);

    // ---------- Login, registration, session ----------

    [HttpPost("login")]
    [EnableRateLimiting(WriteRateLimitPolicy)]
    public async Task<ActionResult<ProfileDto>> Login(LoginInput input, CancellationToken ct)
    {
        if (PhoneNumber.Normalize(input.Phone) is not { } phone)
            return Invalid(nameof(input.Phone), "phone");

        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Phone == phone, ct);
        if (user is null)
            return NotFound(new { code = "notRegistered" });

        StartSession(user.Id);
        return ToDto(user);
    }

    [HttpPost("register")]
    [EnableRateLimiting(WriteRateLimitPolicy)]
    public async Task<ActionResult<ProfileDto>> Register(ProfileInput input, CancellationToken ct)
    {
        var errors = Validate(input);
        var phone = PhoneNumber.Normalize(input.Phone);
        if (phone is null)
            errors.Add(nameof(input.Phone), "phone");
        if (errors.Any)
            return Invalid(errors);

        if (await db.Users.AnyAsync(u => u.Phone == phone, ct))
            return Conflict("phoneTaken");

        var user = new User { Phone = phone!, FullName = "", Address = "" };
        Apply(user, input);
        db.Users.Add(user);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Someone registered the same phone a moment ago.
            return Conflict("phoneTaken");
        }

        // Orders placed as a guest with this phone now belong to the new account.
        await db.Orders.Where(o => o.UserId == null && o.Phone == phone)
            .ExecuteUpdateAsync(s => s.SetProperty(o => o.UserId, (int?)user.Id), ct);

        StartSession(user.Id);
        return ToDto(user);
    }

    [HttpPost("logout")]
    public IActionResult Logout()
    {
        Response.Cookies.Delete(cookie.Value.UserName, CookieFor(null));
        return NoContent();
    }

    [HttpGet("me")]
    [Authorize(AuthenticationSchemes = UserTokenService.Scheme)]
    public async Task<ActionResult<ProfileDto>> Me(CancellationToken ct)
    {
        var user = await CurrentUserAsync(ct);
        if (user is null)
            return Unauthorized();
        return ToDto(user);
    }

    [HttpPut("me")]
    [Authorize(AuthenticationSchemes = UserTokenService.Scheme)]
    [EnableRateLimiting(WriteRateLimitPolicy)]
    public async Task<ActionResult<ProfileDto>> UpdateMe(ProfileInput input, CancellationToken ct)
    {
        var user = await CurrentUserAsync(tracking: true, ct);
        if (user is null)
            return Unauthorized();

        var errors = Validate(input);
        var phone = PhoneNumber.Normalize(input.Phone);
        if (phone is null)
            errors.Add(nameof(input.Phone), "phone");
        else if (phone != user.Phone && await db.Users.AnyAsync(u => u.Phone == phone && u.Id != user.Id, ct))
            return Conflict("phoneTaken");
        if (errors.Any)
            return Invalid(errors);

        user.Phone = phone!;
        Apply(user, input);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            return Conflict("phoneTaken");
        }
        return ToDto(user);
    }

    // ---------- Order history ----------

    [HttpGet("orders")]
    [Authorize(AuthenticationSchemes = UserTokenService.Scheme)]
    public async Task<IReadOnlyList<HistoryOrderDto>> Orders(CancellationToken ct)
    {
        var userId = CurrentUserId();
        var orders = await db.Orders.AsNoTracking()
            .Include(o => o.Items)
            .Where(o => o.UserId == userId)
            .OrderByDescending(o => o.CreatedAt).ThenByDescending(o => o.Id)
            .Take(HistoryLimit)
            .ToListAsync(ct);

        return orders.Select(o => new HistoryOrderDto(
            o.Id, o.SupplyDate, o.Status, o.FulfillmentMethod, o.PaymentMethod, o.IsPaid, o.Total, o.CreatedAt,
            o.Items.OrderBy(i => i.Id)
                .Select(i => new HistoryItemDto(
                    i.Id, i.DishId, i.ParentItemId, i.DishName, i.OptionLabel, i.Quantity, i.UnitPrice, i.LineTotal))
                .ToList()))
            .ToList();
    }

    // ---------- Favorites ----------

    [HttpGet("favorites")]
    [Authorize(AuthenticationSchemes = UserTokenService.Scheme)]
    public async Task<IReadOnlyList<FavoriteDto>> Favorites(CancellationToken ct)
    {
        var userId = CurrentUserId();
        var favorites = await db.FavoriteOrders.AsNoTracking()
            .Where(f => f.UserId == userId).OrderBy(f => f.Id).ToListAsync(ct);
        return favorites.Select(ToDto).ToList();
    }

    /// <summary>Saves one of the user's past orders under a name. It refers to current dishes, not to old prices.</summary>
    [HttpPost("favorites")]
    [Authorize(AuthenticationSchemes = UserTokenService.Scheme)]
    [EnableRateLimiting(WriteRateLimitPolicy)]
    public async Task<ActionResult<FavoriteDto>> AddFavorite(FavoriteInput input, CancellationToken ct)
    {
        var userId = CurrentUserId();
        var errors = new Errors();
        errors.Text(nameof(input.Name), input.Name, FavoriteNameMaxLength, required: true);
        var name = input.Name?.Trim() ?? "";

        var existing = await db.FavoriteOrders.AsNoTracking().Where(f => f.UserId == userId).Select(f => f.Name).ToListAsync(ct);
        if (existing.Count >= MaxFavorites)
            errors.Add(nameof(input.Name), "tooManyFavorites");
        else if (name.Length > 0 && existing.Any(n => string.Equals(n, name, StringComparison.CurrentCultureIgnoreCase)))
            errors.Add(nameof(input.Name), "duplicate");
        if (errors.Any)
            return Invalid(errors);

        var order = await db.Orders.AsNoTracking().Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.Id == input.OrderId && o.UserId == userId, ct);
        if (order is null)
            return NotFound();

        var dishIds = order.Items.Select(i => i.DishId).Distinct().ToList();
        var dishes = await db.Dishes.AsNoTracking().Include(d => d.Options)
            .Where(d => dishIds.Contains(d.Id) && !d.IsHidden)
            .ToDictionaryAsync(d => d.Id, ct);

        var items = order.Items
            .Where(i => i.ParentItemId is null && dishes.ContainsKey(i.DishId))
            .OrderBy(i => i.Id)
            .Select(parent => new FavoriteOrderItem
            {
                DishId = parent.DishId,
                OptionId = OptionOf(dishes[parent.DishId], parent.OptionLabel),
                Quantity = parent.Quantity,
                AddOns = order.Items
                    .Where(a => a.ParentItemId == parent.Id && dishes.ContainsKey(a.DishId))
                    .OrderBy(a => a.Id)
                    .Select(a => new FavoriteOrderAddOn
                    {
                        DishId = a.DishId,
                        OptionId = OptionOf(dishes[a.DishId], a.OptionLabel),
                        Quantity = a.Quantity,
                    })
                    .ToList(),
            })
            .ToList();
        if (items.Count == 0)
            return Invalid("orderId", "emptyOrder");

        var favorite = new FavoriteOrder { UserId = userId, Name = name, Items = items };
        db.FavoriteOrders.Add(favorite);
        await db.SaveChangesAsync(ct);
        return ToDto(favorite);
    }

    [HttpDelete("favorites/{id:int}")]
    [Authorize(AuthenticationSchemes = UserTokenService.Scheme)]
    public async Task<IActionResult> RemoveFavorite(int id, CancellationToken ct)
    {
        var userId = CurrentUserId();
        var deleted = await db.FavoriteOrders.Where(f => f.Id == id && f.UserId == userId).ExecuteDeleteAsync(ct);
        return deleted == 0 ? NotFound() : NoContent();
    }

    // ---------- Recommendations ----------

    [HttpGet("recommendations")]
    [Authorize(AuthenticationSchemes = UserTokenService.Scheme)]
    public async Task<IReadOnlyList<RecommendationDto>> Recommendations(CancellationToken ct)
    {
        var userId = CurrentUserId();
        return await db.Recommendations.AsNoTracking()
            .Where(r => r.UserId == userId)
            .OrderByDescending(r => r.CreatedAt).ThenByDescending(r => r.Id)
            .Select(r => new RecommendationDto(r.Id, r.Text, r.CreatedAt, r.IsHandled))
            .ToListAsync(ct);
    }

    [HttpPost("recommendations")]
    [Authorize(AuthenticationSchemes = UserTokenService.Scheme)]
    [EnableRateLimiting(WriteRateLimitPolicy)]
    public async Task<ActionResult<RecommendationDto>> AddRecommendation(RecommendationInput input, CancellationToken ct)
    {
        var userId = CurrentUserId();
        var errors = new Errors();
        errors.Text(nameof(input.Text), input.Text, RecommendationMaxLength, required: true);
        if (errors.Any)
            return Invalid(errors);

        var now = time.GetUtcNow();
        var since = now.AddDays(-1);
        if (await db.Recommendations.CountAsync(r => r.UserId == userId && r.CreatedAt > since, ct) >= MaxRecommendationsPerDay)
            return Invalid(nameof(input.Text), "tooManyRecommendations");

        var recommendation = new Recommendation { UserId = userId, Text = input.Text!.Trim(), CreatedAt = now };
        db.Recommendations.Add(recommendation);
        await db.SaveChangesAsync(ct);
        return new RecommendationDto(recommendation.Id, recommendation.Text, recommendation.CreatedAt, recommendation.IsHandled);
    }

    // ---------- Helpers ----------

    private int CurrentUserId() => int.Parse(User.FindFirst("sub")!.Value);

    private Task<User?> CurrentUserAsync(CancellationToken ct) => CurrentUserAsync(tracking: false, ct);

    private async Task<User?> CurrentUserAsync(bool tracking, CancellationToken ct)
    {
        var id = CurrentUserId();
        var users = tracking ? db.Users : db.Users.AsNoTracking();
        return await users.FirstOrDefaultAsync(u => u.Id == id, ct);
    }

    private void StartSession(int userId)
    {
        var (token, expiresAt) = tokens.CreateToken(userId);
        Response.Cookies.Append(cookie.Value.UserName, token, CookieFor(expiresAt));
    }

    private Microsoft.AspNetCore.Http.CookieOptions CookieFor(DateTimeOffset? expires) => new()
    {
        HttpOnly = true,
        Secure = cookie.Value.Secure,
        SameSite = cookie.Value.SameSite,
        Path = "/api",
        Expires = expires,
    };

    /// <summary>The current option of a dish with this label, or null (the default is used then).</summary>
    private static int? OptionOf(Dish dish, string? label) =>
        dish.ChoiceMode == ChoiceMode.Free ? null : dish.Options.FirstOrDefault(o => o.Label == label)?.Id;

    private static Errors Validate(ProfileInput input)
    {
        var errors = new Errors();
        errors.Text(nameof(input.FullName), input.FullName, NameMaxLength, required: true);
        errors.Text(nameof(input.City), input.City, AddressFormat.PartMaxLength, required: true);
        errors.Text(nameof(input.Street), input.Street, AddressFormat.PartMaxLength, required: true);
        errors.Text(nameof(input.HouseNumber), input.HouseNumber, AddressFormat.PartMaxLength, required: true);
        errors.Text(nameof(input.Apartment), input.Apartment, AddressFormat.PartMaxLength);
        errors.Text(nameof(input.Email), input.Email, EmailMaxLength);
        errors.Text(nameof(input.EthnicBackground), input.EthnicBackground, EthnicBackgroundMaxLength);
        if (!string.IsNullOrWhiteSpace(input.Email) && !ContactsController.LooksLikeEmail(input.Email.Trim()))
            errors.Add(nameof(input.Email), "email");
        if (input.Birthday is { } birthday
            && (birthday < EarliestBirthday || birthday > DateOnly.FromDateTime(DateTime.UtcNow)))
            errors.Add(nameof(input.Birthday), "invalid");
        return errors;
    }

    private static void Apply(User user, ProfileInput input)
    {
        user.FullName = input.FullName!.Trim();
        user.City = input.City!.Trim();
        user.Street = input.Street!.Trim();
        user.HouseNumber = input.HouseNumber!.Trim();
        user.Apartment = input.Apartment?.Trim() ?? "";
        user.Address = AddressFormat.Compose(user.City, user.Street, user.HouseNumber, user.Apartment);
        user.Email = Clean(input.Email);
        user.Birthday = input.Birthday;
        user.EthnicBackground = Clean(input.EthnicBackground);
    }

    private static ProfileDto ToDto(User u) =>
        new(u.Id, u.Phone, u.FullName, u.City, u.Street, u.HouseNumber, u.Apartment, u.Address, u.Email, u.Birthday, u.EthnicBackground);

    private static FavoriteDto ToDto(FavoriteOrder f) =>
        new(f.Id, f.Name, f.Items.Select(i => new FavoriteItemDto(
            i.DishId, i.OptionId, i.Quantity,
            i.AddOns.Select(a => new FavoriteAddOnDto(a.DishId, a.OptionId, a.Quantity)).ToList())).ToList());
}
