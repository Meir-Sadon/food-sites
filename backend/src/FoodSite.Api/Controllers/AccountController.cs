using FoodSite.Api.Auth;
using FoodSite.Api.Controllers.Admin;
using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Orders;
using FoodSite.Api.Phones;
using FoodSite.Api.Sites;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using static FoodSite.Api.Controllers.Admin.Ordering;

namespace FoodSite.Api.Controllers;

/// <summary>
/// Client accounts: login and registration by phone number, the
/// profile, order history, favorites, recommendations and the client's reviews. Everything except login,
/// registration and logout needs the client's session cookie.
/// </summary>
[Route("api/account")]
public class AccountController(
    AppDbContext db,
    UserTokenService tokens,
    IOptions<Auth.CookieOptions> cookie,
    IOptions<GoogleOptions> google,
    IGoogleTokenVerifier googleVerifier,
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

    public const int MaxAddresses = UserAddress.MaxPerUser;
    /// <summary>A guest's choice to keep their details is only taken for an order placed this recently.</summary>
    public static readonly TimeSpan RememberWindow = TimeSpan.FromHours(2);

    public record LoginInput(string? Phone);

    /// <summary>The order page's state as it keeps it, and how many dishes it holds.</summary>
    public record CartDto(string Content, int ItemCount, DateTimeOffset UpdatedAt);

    public record CartInput(string? Content, int ItemCount);

    /// <summary>The client's session profile, and whether this login just made the account (the first time this phone came).</summary>
    public record LoginDto(ProfileDto Profile, bool IsNew);

    public record AddressInput(string? Label, string? City, string? Street, string? HouseNumber, string? Apartment, bool MakeDefault = false);

    public record AddressDto(
        int Id, string? Label, string City, string Street, string HouseNumber, string Apartment, string Address, bool IsDefault);

    /// <summary>What a client chose to keep after an order (<see cref="OrderId"/> is the order that was just placed).</summary>
    public record RememberInput(
        int OrderId, string? Phone, string? Name, string? City, string? Street, string? HouseNumber, string? Apartment);

    /// <summary>Whether the details were kept, and the profile when the client is logged in.</summary>
    public record RememberDto(bool Saved, ProfileDto? Profile);

    public record GoogleInput(string? Credential);

    public record GoogleRegisterInput(string? Credential, ProfileInput? Profile);

    /// <summary>What Google already told us about a person with no account yet, to prefill the registration form.</summary>
    public record GoogleRegistrationDto(string? FullName, string? Email);

    /// <summary>Either the client is logged in (<see cref="Profile"/>) or has to register first (<see cref="Registration"/>).</summary>
    public record GoogleLoginDto(ProfileDto? Profile, GoogleRegistrationDto? Registration);

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
        string Address, string? Email, DateOnly? Birthday, string? EthnicBackground, IReadOnlyList<AddressDto> Addresses);

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

    /// <summary>A review the client sent on one of their orders, and whether it is shown on the site.</summary>
    public record MyReviewDto(
        int Id, int OrderId, DateOnly SupplyDate, int Rating, string? Comment, string? Name, IReadOnlyList<string> Images,
        ReviewStatus Status, DateTimeOffset SubmittedAt);

    // ---------- Login, registration, session ----------

    /// <summary>
    /// Login and registration are the same step: a phone number that has no account yet gets one right here, with
    /// nothing else filled in (the client adds details afterwards, or never). Whatever a guest with this phone chose to
    /// keep after an order starts the new account off.
    /// </summary>
    [HttpPost("login")]
    [EnableRateLimiting(WriteRateLimitPolicy)]
    public async Task<ActionResult<LoginDto>> Login(LoginInput input, CancellationToken ct)
    {
        if (PhoneNumber.Normalize(input.Phone) is not { } phone)
            return Invalid(nameof(input.Phone), "phone");

        var user = await WithAddresses(db.Users.AsNoTracking()).FirstOrDefaultAsync(u => u.Phone == phone, ct);
        var isNew = user is null;
        if (user is null)
        {
            user = await CreateUserAsync(phone, googleSub: null, ct);
            if (user is null)
            {
                // Someone made the same account a moment ago.
                user = await WithAddresses(db.Users.AsNoTracking()).FirstAsync(u => u.Phone == phone, ct);
                isNew = false;
            }
        }

        StartSession(user.Id);
        return new LoginDto(ToDto(user), isNew);
    }

    /// <summary>
    /// Registers with the details in one go (the order page and the login page use <see cref="Login"/> and add
    /// details afterwards); only the phone is required.
    /// </summary>
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

        var user = await CreateUserAsync(phone!, googleSub: null, ct, input);
        if (user is null)
            return Conflict("phoneTaken");

        StartSession(user.Id);
        return ToDto(user);
    }

    /// <summary>
    /// Sign in with a Google ID token. An account already tied to this Google id is logged in; else one whose email is the
    /// Google account's verified email (and is not tied to another Google account) is tied to it and logged in; else the
    /// client has to register (the address and phone are still needed), see <see cref="GoogleRegister"/>.
    /// </summary>
    [HttpPost("google")]
    [EnableRateLimiting(WriteRateLimitPolicy)]
    public async Task<ActionResult<GoogleLoginDto>> GoogleLogin(GoogleInput input, CancellationToken ct)
    {
        if (!google.Value.IsConfigured)
            return NotFound(new { code = "googleDisabled" });
        if (await googleVerifier.VerifyAsync(input.Credential ?? "", ct) is not { } identity)
            return Unauthorized(new { code = "googleInvalid" });

        var user = await WithAddresses(db.Users).FirstOrDefaultAsync(u => u.GoogleSub == identity.Subject, ct);
        if (user is null && VerifiedEmail(identity) is { } email)
        {
            var matches = await WithAddresses(db.Users)
                .Where(u => u.GoogleSub == null && u.Email != null && u.Email.ToLower() == email.ToLower())
                .Take(2).ToListAsync(ct);
            // Two accounts with this email: not sure which is theirs, so register instead of guessing.
            if (matches.Count == 1)
            {
                user = matches[0];
                user.GoogleSub = identity.Subject;
                try
                {
                    await db.SaveChangesAsync(ct);
                }
                catch (DbUpdateException)
                {
                    return Conflict("googleTaken");
                }
            }
        }

        if (user is null)
            return new GoogleLoginDto(null, new GoogleRegistrationDto(Clean(identity.Name), VerifiedEmail(identity)));

        StartSession(user.Id);
        return new GoogleLoginDto(ToDto(user), null);
    }

    /// <summary>Registers a new account for a Google identity, with the phone and address the order needs.</summary>
    [HttpPost("google/register")]
    [EnableRateLimiting(WriteRateLimitPolicy)]
    public async Task<ActionResult<ProfileDto>> GoogleRegister(GoogleRegisterInput input, CancellationToken ct)
    {
        if (!google.Value.IsConfigured)
            return NotFound(new { code = "googleDisabled" });
        if (await googleVerifier.VerifyAsync(input.Credential ?? "", ct) is not { } identity)
            return Unauthorized(new { code = "googleInvalid" });
        if (input.Profile is not { } profile)
            return Invalid(nameof(input.Profile), "required");

        if (await db.Users.AnyAsync(u => u.GoogleSub == identity.Subject, ct))
            return Conflict("googleTaken");

        var errors = Validate(profile);
        var phone = PhoneNumber.Normalize(profile.Phone);
        if (phone is null)
            errors.Add(nameof(profile.Phone), "phone");
        if (errors.Any)
            return Invalid(errors);
        if (await db.Users.AnyAsync(u => u.Phone == phone, ct))
            return Conflict("phoneTaken");

        var user = await CreateUserAsync(phone!, identity.Subject, ct, profile, VerifiedEmail(identity));
        if (user is null)
            return Conflict("phoneTaken");

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
        AddAddress(user, null, input.City, input.Street, input.HouseNumber, input.Apartment, makeDefault: false, time.GetUtcNow());
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

    // ---------- Addresses ----------

    [HttpGet("addresses")]
    [Authorize(AuthenticationSchemes = UserTokenService.Scheme)]
    public async Task<IReadOnlyList<AddressDto>> Addresses(CancellationToken ct)
    {
        var userId = CurrentUserId();
        var addresses = await db.UserAddresses.AsNoTracking().Where(a => a.UserId == userId).ToListAsync(ct);
        return Sorted(addresses).Select(ToDto).ToList();
    }

    /// <summary>Adds an address. The first one is the default; <c>MakeDefault</c> makes a later one the default.</summary>
    [HttpPost("addresses")]
    [Authorize(AuthenticationSchemes = UserTokenService.Scheme)]
    [EnableRateLimiting(WriteRateLimitPolicy)]
    public async Task<ActionResult<ProfileDto>> AddAddress(AddressInput input, CancellationToken ct)
    {
        var errors = ValidateAddress(input);
        if (errors.Any)
            return Invalid(errors);

        var user = await CurrentUserAsync(tracking: true, ct);
        if (user is null)
            return Unauthorized();
        if (user.Addresses.Count >= MaxAddresses)
            return Invalid(nameof(input.Street), "tooManyAddresses");
        if (user.Addresses.Any(a => a.Address == ComposeOf(input)))
            return Invalid(nameof(input.Street), "duplicate");

        AddAddress(user, input.Label, input.City, input.Street, input.HouseNumber, input.Apartment, input.MakeDefault, time.GetUtcNow());
        await db.SaveChangesAsync(ct);
        return ToDto(user);
    }

    [HttpPut("addresses/{id:int}")]
    [Authorize(AuthenticationSchemes = UserTokenService.Scheme)]
    [EnableRateLimiting(WriteRateLimitPolicy)]
    public async Task<ActionResult<ProfileDto>> UpdateAddress(int id, AddressInput input, CancellationToken ct)
    {
        var errors = ValidateAddress(input);
        if (errors.Any)
            return Invalid(errors);

        var user = await CurrentUserAsync(tracking: true, ct);
        if (user is null)
            return Unauthorized();
        if (user.Addresses.FirstOrDefault(a => a.Id == id) is not { } address)
            return NotFound();
        if (user.Addresses.Any(a => a.Id != id && a.Address == ComposeOf(input)))
            return Invalid(nameof(input.Street), "duplicate");

        address.Label = Clean(input.Label);
        address.City = input.City!.Trim();
        address.Street = input.Street!.Trim();
        address.HouseNumber = input.HouseNumber!.Trim();
        address.Apartment = input.Apartment?.Trim() ?? "";
        address.Address = AddressFormat.Compose(address.City, address.Street, address.HouseNumber, address.Apartment);
        if (input.MakeDefault)
            SetDefault(user, address);
        SyncDefault(user);
        await db.SaveChangesAsync(ct);
        return ToDto(user);
    }

    [HttpPut("addresses/{id:int}/default")]
    [Authorize(AuthenticationSchemes = UserTokenService.Scheme)]
    [EnableRateLimiting(WriteRateLimitPolicy)]
    public async Task<ActionResult<ProfileDto>> MakeDefaultAddress(int id, CancellationToken ct)
    {
        var user = await CurrentUserAsync(tracking: true, ct);
        if (user is null)
            return Unauthorized();
        if (user.Addresses.FirstOrDefault(a => a.Id == id) is not { } address)
            return NotFound();

        SetDefault(user, address);
        SyncDefault(user);
        await db.SaveChangesAsync(ct);
        return ToDto(user);
    }

    /// <summary>Deletes an address; when it was the default, the oldest of the rest takes over.</summary>
    [HttpDelete("addresses/{id:int}")]
    [Authorize(AuthenticationSchemes = UserTokenService.Scheme)]
    [EnableRateLimiting(WriteRateLimitPolicy)]
    public async Task<ActionResult<ProfileDto>> DeleteAddress(int id, CancellationToken ct)
    {
        var user = await CurrentUserAsync(tracking: true, ct);
        if (user is null)
            return Unauthorized();
        if (user.Addresses.FirstOrDefault(a => a.Id == id) is not { } address)
            return NotFound();

        user.Addresses.Remove(address);
        db.UserAddresses.Remove(address);
        if (address.IsDefault && user.Addresses.OrderBy(a => a.CreatedAt).ThenBy(a => a.Id).FirstOrDefault() is { } next)
            next.IsDefault = true;
        SyncDefault(user);
        await db.SaveChangesAsync(ct);
        return ToDto(user);
    }

    // ---------- Keeping details after an order ----------

    /// <summary>
    /// After an order the client says "keep my details for next time". A logged-in client gets them on their account
    /// (the name if it was empty, the address among their addresses). A guest with no account is remembered by phone,
    /// and the account made for that phone later starts from it. The order has to be real, recent and for the same phone;
    /// a phone that already has an account is not written to by someone who is not logged in as it.
    /// </summary>
    [HttpPost("remember")]
    [EnableRateLimiting(WriteRateLimitPolicy)]
    public async Task<ActionResult<RememberDto>> Remember(RememberInput input, CancellationToken ct)
    {
        if (PhoneNumber.Normalize(input.Phone) is not { } phone)
            return Invalid(nameof(input.Phone), "phone");
        var errors = new Errors();
        errors.Text(nameof(input.Name), input.Name, NameMaxLength);
        errors.Text(nameof(input.City), input.City, AddressFormat.PartMaxLength);
        errors.Text(nameof(input.Street), input.Street, AddressFormat.PartMaxLength);
        errors.Text(nameof(input.HouseNumber), input.HouseNumber, AddressFormat.PartMaxLength);
        errors.Text(nameof(input.Apartment), input.Apartment, AddressFormat.PartMaxLength);
        var hasAddress = new[] { input.City, input.Street, input.HouseNumber }.All(p => !string.IsNullOrWhiteSpace(p));
        if (!hasAddress && new[] { input.City, input.Street, input.HouseNumber }.Any(p => !string.IsNullOrWhiteSpace(p)))
            errors.Add(nameof(input.Street), "required");
        if (errors.Any)
            return Invalid(errors);

        var since = time.GetUtcNow() - RememberWindow;
        if (!await db.Orders.AnyAsync(o => o.Id == input.OrderId && o.Phone == phone && o.CreatedAt >= since, ct))
            return NotFound();

        var session = await HttpContext.AuthenticateAsync(UserTokenService.Scheme);
        var userId = session.Succeeded && int.TryParse(session.Principal!.FindFirst("sub")?.Value, out var id) ? id : (int?)null;
        var user = await WithAddresses(db.Users).FirstOrDefaultAsync(u => u.Phone == phone, ct);
        if (user is not null)
        {
            if (user.Id != userId)
                return new RememberDto(false, null);
            if (user.FullName == "" && Clean(input.Name) is { } name)
                user.FullName = name.Length <= NameMaxLength ? name : name[..NameMaxLength];
            if (hasAddress && !user.Addresses.Any(a => a.Address == AddressFormat.Compose(input.City, input.Street, input.HouseNumber, input.Apartment))
                && user.Addresses.Count < MaxAddresses)
                AddAddress(user, null, input.City, input.Street, input.HouseNumber, input.Apartment, makeDefault: false, time.GetUtcNow());
            await db.SaveChangesAsync(ct);
            return new RememberDto(true, ToDto(user));
        }

        var guest = await db.GuestDetails.FirstOrDefaultAsync(g => g.Phone == phone, ct);
        if (guest is null)
            db.GuestDetails.Add(guest = new GuestDetails { Phone = phone });
        guest.FullName = Clean(input.Name) ?? "";
        guest.City = hasAddress ? input.City!.Trim() : "";
        guest.Street = hasAddress ? input.Street!.Trim() : "";
        guest.HouseNumber = hasAddress ? input.HouseNumber!.Trim() : "";
        guest.Apartment = hasAddress ? input.Apartment?.Trim() ?? "" : "";
        guest.SavedAt = time.GetUtcNow();
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Another save for this phone landed first; either copy is fine.
        }
        return new RememberDto(true, null);
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

    // ---------- Order in progress ----------

    /// <summary>The client's order in progress saved on the server, or 204 when there is none.</summary>
    [HttpGet("cart")]
    [Authorize(AuthenticationSchemes = UserTokenService.Scheme)]
    public async Task<ActionResult<CartDto>> GetCart(CancellationToken ct)
    {
        var userId = CurrentUserId();
        var cart = await db.SavedCarts.AsNoTracking().SingleOrDefaultAsync(c => c.UserId == userId, ct);
        return cart is null ? NoContent() : new CartDto(cart.Content, cart.ItemCount, cart.UpdatedAt);
    }

    /// <summary>Keeps the order in progress; an empty one (no dishes) is removed instead.</summary>
    [HttpPut("cart")]
    [Authorize(AuthenticationSchemes = UserTokenService.Scheme)]
    public async Task<ActionResult> SaveCart(CartInput input, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(input.Content))
            return Invalid(nameof(input.Content), "required");
        if (input.Content.Length > SavedCart.ContentMaxLength)
            return Invalid(nameof(input.Content), "tooLong");
        var userId = CurrentUserId();
        var cart = await db.SavedCarts.SingleOrDefaultAsync(c => c.UserId == userId, ct);
        if (input.ItemCount <= 0)
        {
            if (cart is not null)
                db.SavedCarts.Remove(cart);
        }
        else
        {
            if (cart is null)
                db.SavedCarts.Add(cart = new SavedCart { UserId = userId, Content = input.Content });
            (cart.Content, cart.ItemCount, cart.UpdatedAt) = (input.Content, input.ItemCount, time.GetUtcNow());
        }
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpDelete("cart")]
    [Authorize(AuthenticationSchemes = UserTokenService.Scheme)]
    public async Task<ActionResult> ClearCart(CancellationToken ct)
    {
        var userId = CurrentUserId();
        if (await db.SavedCarts.SingleOrDefaultAsync(c => c.UserId == userId, ct) is { } cart)
        {
            db.SavedCarts.Remove(cart);
            await db.SaveChangesAsync(ct);
        }
        return NoContent();
    }

    // ---------- Favorites ----------

    [HttpGet("favorites")]
    [Authorize(AuthenticationSchemes = UserTokenService.Scheme)]
    [RequireFeature(Features.Favorites)]
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
    [RequireFeature(Features.Favorites)]
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
        var dishes = await db.Dishes.AsNoTracking().Include(d => d.Options).Include(d => d.MainDish).ThenInclude(m => m!.Options)
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
    [RequireFeature(Features.Favorites)]
    public async Task<IActionResult> RemoveFavorite(int id, CancellationToken ct)
    {
        var userId = CurrentUserId();
        var deleted = await db.FavoriteOrders.Where(f => f.Id == id && f.UserId == userId).ExecuteDeleteAsync(ct);
        return deleted == 0 ? NotFound() : NoContent();
    }

    // ---------- Recommendations ----------

    [HttpGet("recommendations")]
    [Authorize(AuthenticationSchemes = UserTokenService.Scheme)]
    [RequireFeature(Features.Recommendations)]
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
    [RequireFeature(Features.Recommendations)]
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

    // ---------- Reviews ----------

    /// <summary>The reviews the client sent on their orders, newest first.</summary>
    [HttpGet("reviews")]
    [Authorize(AuthenticationSchemes = UserTokenService.Scheme)]
    [RequireFeature(Features.Reviews)]
    public async Task<IReadOnlyList<MyReviewDto>> Reviews(CancellationToken ct)
    {
        var userId = CurrentUserId();
        var reviews = await db.Reviews.AsNoTracking()
            .Where(r => r.Order!.UserId == userId && r.SubmittedAt != null)
            .Include(r => r.Order).Include(r => r.Images)
            .OrderByDescending(r => r.SubmittedAt).ThenByDescending(r => r.Id)
            .ToListAsync(ct);
        return reviews.Select(r => new MyReviewDto(
            r.Id, r.OrderId, r.Order!.SupplyDate, r.Rating ?? 0, r.Comment, r.Name,
            r.Images.OrderBy(i => i.DisplayOrder).Select(i => i.Url).ToList(), r.Status, r.SubmittedAt!.Value)).ToList();
    }

    // ---------- Helpers ----------

    private static string? VerifiedEmail(GoogleIdentity identity) =>
        identity.EmailVerified && Clean(identity.Email) is { Length: <= EmailMaxLength } email ? email : null;

    private int CurrentUserId() => int.Parse(User.FindFirst("sub")!.Value);

    private Task<User?> CurrentUserAsync(CancellationToken ct) => CurrentUserAsync(tracking: false, ct);

    private async Task<User?> CurrentUserAsync(bool tracking, CancellationToken ct)
    {
        var id = CurrentUserId();
        var users = WithAddresses(tracking ? db.Users : db.Users.AsNoTracking());
        return await users.FirstOrDefaultAsync(u => u.Id == id, ct);
    }

    private static IQueryable<User> WithAddresses(IQueryable<User> users) => users.Include(u => u.Addresses);

    /// <summary>
    /// A new account for a phone, started from what a guest with that phone kept (and from the profile the client gave,
    /// if any). Null when the phone was taken in the meantime. Orders placed as a guest with this phone now belong to it.
    /// </summary>
    private async Task<User?> CreateUserAsync(string phone, string? googleSub, CancellationToken ct, ProfileInput? profile = null, string? email = null)
    {
        var now = time.GetUtcNow();
        var user = new User { Phone = phone, FullName = "", Address = "", CreatedAt = now, GoogleSub = googleSub };
        if (profile is not null)
            Apply(user, profile);
        user.Email ??= email;

        var guest = await db.GuestDetails.FirstOrDefaultAsync(g => g.Phone == phone, ct);
        if (guest is not null)
        {
            if (user.FullName == "")
                user.FullName = guest.FullName;
            if (guest.Street != "")
                AddAddress(user, null, guest.City, guest.Street, guest.HouseNumber, guest.Apartment, makeDefault: false, now);
            db.GuestDetails.Remove(guest);
        }
        if (profile is not null)
            AddAddress(user, null, profile.City, profile.Street, profile.HouseNumber, profile.Apartment, makeDefault: true, now);

        db.Users.Add(user);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            db.ChangeTracker.Clear();
            return null;
        }

        await db.Orders.Where(o => o.UserId == null && o.Phone == phone)
            .ExecuteUpdateAsync(s => s.SetProperty(o => o.UserId, (int?)user.Id), ct);
        return user;
    }

    private static string ComposeOf(AddressInput input) =>
        AddressFormat.Compose(input.City, input.Street, input.HouseNumber, input.Apartment);

    private static IEnumerable<UserAddress> Sorted(IEnumerable<UserAddress> addresses) =>
        addresses.OrderByDescending(a => a.IsDefault).ThenBy(a => a.CreatedAt).ThenBy(a => a.Id);

    private static void SetDefault(User user, UserAddress address)
    {
        foreach (var other in user.Addresses)
            other.IsDefault = other == address;
    }

    /// <summary>Keeps one default among the addresses and the address columns of <see cref="User"/> equal to it.</summary>
    private static void SyncDefault(User user)
    {
        var chosen = user.Addresses.FirstOrDefault(a => a.IsDefault)
            ?? user.Addresses.OrderBy(a => a.CreatedAt).ThenBy(a => a.Id).FirstOrDefault();
        foreach (var address in user.Addresses)
            address.IsDefault = address == chosen;
        user.City = chosen?.City ?? "";
        user.Street = chosen?.Street ?? "";
        user.HouseNumber = chosen?.HouseNumber ?? "";
        user.Apartment = chosen?.Apartment ?? "";
        user.Address = chosen?.Address ?? "";
    }

    /// <summary>Adds an address unless the user has it already (or the parts are empty); the first one is the default.</summary>
    private static void AddAddress(
        User user, string? label, string? city, string? street, string? houseNumber, string? apartment, bool makeDefault, DateTimeOffset now)
    {
        if (string.IsNullOrWhiteSpace(city) || string.IsNullOrWhiteSpace(street) || string.IsNullOrWhiteSpace(houseNumber))
            return;
        var composed = AddressFormat.Compose(city, street, houseNumber, apartment);
        var existing = user.Addresses.FirstOrDefault(a => a.Address == composed);
        if (existing is null)
        {
            existing = new UserAddress
            {
                City = city.Trim(), Street = street.Trim(), HouseNumber = houseNumber.Trim(), Apartment = apartment?.Trim() ?? "",
                Address = composed, Label = Clean(label), CreatedAt = now,
            };
            user.Addresses.Add(existing);
        }
        if (makeDefault || user.Addresses.Count == 1)
            SetDefault(user, existing);
        SyncDefault(user);
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
        DishRules.Pricing(dish) is var pricing && pricing.ChoiceMode == ChoiceMode.Free
            ? null : pricing.Options.FirstOrDefault(o => o.Label == label)?.Id;

    /// <summary>Nothing is required but the phone; an address, once started, needs its city, street and house number.</summary>
    private static Errors Validate(ProfileInput input)
    {
        var errors = new Errors();
        errors.Text(nameof(input.FullName), input.FullName, NameMaxLength);
        errors.Text(nameof(input.City), input.City, AddressFormat.PartMaxLength);
        errors.Text(nameof(input.Street), input.Street, AddressFormat.PartMaxLength);
        errors.Text(nameof(input.HouseNumber), input.HouseNumber, AddressFormat.PartMaxLength);
        errors.Text(nameof(input.Apartment), input.Apartment, AddressFormat.PartMaxLength);
        errors.Text(nameof(input.Email), input.Email, EmailMaxLength);
        errors.Text(nameof(input.EthnicBackground), input.EthnicBackground, EthnicBackgroundMaxLength);
        if (new[] { input.City, input.Street, input.HouseNumber, input.Apartment }.Any(p => !string.IsNullOrWhiteSpace(p)))
        {
            if (string.IsNullOrWhiteSpace(input.City)) errors.Add(nameof(input.City), "required");
            if (string.IsNullOrWhiteSpace(input.Street)) errors.Add(nameof(input.Street), "required");
            if (string.IsNullOrWhiteSpace(input.HouseNumber)) errors.Add(nameof(input.HouseNumber), "required");
        }
        if (!string.IsNullOrWhiteSpace(input.Email) && !ContactsController.LooksLikeEmail(input.Email.Trim()))
            errors.Add(nameof(input.Email), "email");
        if (input.Birthday is { } birthday
            && (birthday < EarliestBirthday || birthday > DateOnly.FromDateTime(DateTime.UtcNow)))
            errors.Add(nameof(input.Birthday), "invalid");
        return errors;
    }

    private static Errors ValidateAddress(AddressInput input)
    {
        var errors = new Errors();
        errors.Text(nameof(input.Label), input.Label, UserAddress.LabelMaxLength);
        errors.Text(nameof(input.City), input.City, AddressFormat.PartMaxLength, required: true);
        errors.Text(nameof(input.Street), input.Street, AddressFormat.PartMaxLength, required: true);
        errors.Text(nameof(input.HouseNumber), input.HouseNumber, AddressFormat.PartMaxLength, required: true);
        errors.Text(nameof(input.Apartment), input.Apartment, AddressFormat.PartMaxLength);
        return errors;
    }

    /// <summary>The personal details; the address (the parts, if sent) is added with <see cref="AddAddress"/>.</summary>
    private static void Apply(User user, ProfileInput input)
    {
        user.FullName = input.FullName?.Trim() ?? "";
        user.Email = Clean(input.Email);
        user.Birthday = input.Birthday;
        user.EthnicBackground = Clean(input.EthnicBackground);
    }

    private static AddressDto ToDto(UserAddress a) =>
        new(a.Id, a.Label, a.City, a.Street, a.HouseNumber, a.Apartment, a.Address, a.IsDefault);

    private static ProfileDto ToDto(User u) =>
        new(u.Id, u.Phone, u.FullName, u.City, u.Street, u.HouseNumber, u.Apartment, u.Address, u.Email, u.Birthday, u.EthnicBackground,
            Sorted(u.Addresses).Select(ToDto).ToList());

    private static FavoriteDto ToDto(FavoriteOrder f) =>
        new(f.Id, f.Name, f.Items.Select(i => new FavoriteItemDto(
            i.DishId, i.OptionId, i.Quantity,
            i.AddOns.Select(a => new FavoriteAddOnDto(a.DishId, a.OptionId, a.Quantity)).ToList())).ToList());
}
