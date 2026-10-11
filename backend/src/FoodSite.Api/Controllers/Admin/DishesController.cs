using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Images;
using FoodSite.Api.Orders;
using FoodSite.Api.Sites;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using static FoodSite.Api.Controllers.Admin.Ordering;

namespace FoodSite.Api.Controllers.Admin;

[Route("api/admin/dishes")]
public class DishesController(AppDbContext db, IImageStore images, SiteClock clock, IOptions<SiteOptions> site) : AdminControllerBase
{
    public const int AllergenMaxLength = 500;
    public const int OptionLabelMaxLength = 50;

    public record OptionDto(int Id, string Label, decimal Amount, decimal Price, bool IsDefault);

    public record ImageDto(int Id, string Url, int DisplayOrder);

    public record DishDto(
        int Id,
        string Name,
        int CategoryId,
        int DisplayOrder,
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
        bool IsHidden,
        IReadOnlyList<OptionDto> Options,
        IReadOnlyList<ImageDto> Images,
        IReadOnlyList<int> ParentDishIds,
        IReadOnlyList<int> AddOnDishIds,
        decimal? MaxPerSupplyDate = null,
        bool OpenByDefault = false,
        bool IsSideDish = false,
        string? UnitName = null);

    /// <summary>An option to keep (with Id) or add (without).</summary>
    public record OptionInput(int? Id, string? Label, decimal Amount, decimal Price, bool IsDefault);

    /// <summary>
    /// ParentDishIds lists the dishes this dish is offered under as an add-on:
    /// ticking A and B on dish C makes C an add-on of A and B.
    /// </summary>
    public record DishInput(
        string? Name,
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
        List<OptionInput>? Options,
        List<int>? ParentDishIds,
        decimal? MaxPerSupplyDate = null,
        bool OpenByDefault = false,
        bool IsSideDish = false,
        string? UnitName = null);

    public record SoldOutInput(bool IsSoldOut);

    /// <summary>The category's dishes (the ones not removed), in the order the admin wants them shown.</summary>
    public record DishOrderInput(int CategoryId, List<int>? DishIds);

    /// <summary>The dish's images in the order the admin wants them shown; the first is the main image.</summary>
    public record ImageOrderInput(List<int>? ImageIds);

    /// <summary>Every dish, removed ones included (IsHidden), for the admin lists.</summary>
    [HttpGet]
    public async Task<IEnumerable<DishDto>> GetAll() =>
        (await WithDetails().OrderBy(d => d.CategoryId).ThenBy(d => d.DisplayOrder).ThenBy(d => d.Id).ToListAsync()).Select(ToDto);

    [HttpGet("{id:int}")]
    public async Task<ActionResult<DishDto>> Get(int id) =>
        await WithDetails().SingleOrDefaultAsync(d => d.Id == id) is { } dish ? ToDto(dish) : NotFound();

    [HttpPost]
    public async Task<ActionResult<DishDto>> Create(DishInput input)
    {
        var dish = new Dish { Name = "" };
        if (await Validate(input, dish) is { } invalid)
            return invalid;

        Apply(input, dish);
        dish.DisplayOrder = await NextOrderAsync(input.CategoryId);
        db.Dishes.Add(dish);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(Get), new { id = dish.Id }, ToDto(await LoadAsync(dish.Id)));
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<DishDto>> Update(int id, DishInput input)
    {
        var dish = await LoadOrNull(id);
        if (dish is null)
            return NotFound();
        if (await Validate(input, dish) is { } invalid)
            return invalid;

        // A dish moved to another category goes last there.
        if (dish.CategoryId != input.CategoryId)
            dish.DisplayOrder = await NextOrderAsync(input.CategoryId);
        Apply(input, dish);
        await db.SaveChangesAsync();
        return ToDto(await LoadAsync(id));
    }

    public record AffectedOrdersDto(int Count);

    /// <summary>
    /// How many orders still to be supplied (today or later, not delivered or cancelled) contain this dish.
    /// The admin screens warn with this number before a dish is removed or changed.
    /// </summary>
    [HttpGet("{id:int}/affected-orders")]
    public async Task<ActionResult<AffectedOrdersDto>> AffectedOrders(int id)
    {
        if (!await db.Dishes.AnyAsync(d => d.Id == id))
            return NotFound();

        var today = DateOnly.FromDateTime(clock.NowLocal());
        var count = await db.Orders.CountAsync(o =>
            o.SupplyDate >= today
            && o.Status != OrderStatus.Cancelled && o.Status != OrderStatus.Delivered
            && o.Items.Any(i => i.DishId == id));
        return new AffectedOrdersDto(count);
    }

    [HttpPut("{id:int}/sold-out")]
    public async Task<ActionResult> SetSoldOut(int id, SoldOutInput input)
    {
        // Loaded rather than updated in place, so the change reaches the audit trail.
        var dish = await db.Dishes.FindAsync(id);
        if (dish is null)
            return NotFound();
        dish.IsSoldOut = input.IsSoldOut;
        await db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>Removes a dish from the site. It is hidden, never deleted, so old orders still show it.</summary>
    [HttpDelete("{id:int}")]
    public async Task<ActionResult> Remove(int id)
    {
        var dish = await db.Dishes.FindAsync(id);
        if (dish is null)
            return NotFound();
        dish.IsHidden = true;
        await db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>Brings a removed dish back, together with its category if that was removed too.</summary>
    [HttpPost("{id:int}/restore")]
    public async Task<ActionResult<DishDto>> Restore(int id)
    {
        var dish = await db.Dishes.Include(d => d.Category).SingleOrDefaultAsync(d => d.Id == id);
        if (dish is null)
            return NotFound();

        dish.IsHidden = false;
        dish.DisplayOrder = await NextOrderAsync(dish.CategoryId);
        if (dish.Category is { IsHidden: true } category)
        {
            category.IsHidden = false;
            category.DisplayOrder = (await db.Categories.Where(c => !c.IsHidden).MaxAsync(c => (int?)c.DisplayOrder) ?? -1) + 1;
        }
        await db.SaveChangesAsync();
        return ToDto(await LoadAsync(id));
    }

    /// <summary>
    /// Sets the order of a category's dishes on the site. The list must name exactly the category's dishes that are
    /// not removed, or it answers 409 listChanged (another tab changed them). Removed dishes go after them, keeping their order.
    /// </summary>
    [HttpPut("order")]
    public async Task<ActionResult<IEnumerable<DishDto>>> Reorder(DishOrderInput input)
    {
        var inCategory = await db.Dishes.Where(d => d.CategoryId == input.CategoryId)
            .OrderBy(d => d.DisplayOrder).ThenBy(d => d.Id).ToListAsync();
        var visible = inCategory.Where(d => !d.IsHidden).ToList();
        if (!SameIds(visible.Select(d => d.Id), input.DishIds))
            return Conflict("listChanged");

        var ordered = input.DishIds!.Select(id => visible.Single(d => d.Id == id))
            .Concat(inCategory.Where(d => d.IsHidden)).ToList();
        Renumber(ordered, (d, n) => d.DisplayOrder = n);
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        return Ok(await GetAll());
    }

    [HttpPost("{id:int}/images")]
    [RequestSizeLimit(ImageUploadRules.MaxRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = ImageUploadRules.MaxRequestBytes)]
    public async Task<ActionResult<DishDto>> AddImage(int id, IFormFile? file, CancellationToken ct)
    {
        var dish = await db.Dishes.Include(d => d.Images).SingleOrDefaultAsync(d => d.Id == id, ct);
        if (dish is null)
            return NotFound();
        if (dish.Images.Count >= Dish.MaxImages)
            return Invalid("file", "tooManyImages");
        if (ImageUploadRules.Validate(file) is { } code)
            return Invalid("file", code);

        StoredImage stored;
        try
        {
            await using var stream = file!.OpenReadStream();
            stored = await images.UploadAsync(stream, file.FileName, site.Value.ImageFolder("dishes"), ct);
        }
        catch (ImageStoreUnavailableException e)
        {
            return ImageStoreUnavailable(e);
        }

        var order = dish.Images.Count == 0 ? 0 : dish.Images.Max(i => i.DisplayOrder) + 1;
        dish.Images.Add(new DishImage { Url = stored.Url, PublicId = stored.PublicId, DisplayOrder = order });
        await db.SaveChangesAsync(ct);
        return ToDto(await LoadAsync(id));
    }

    [HttpDelete("{id:int}/images/{imageId:int}")]
    public async Task<ActionResult<DishDto>> RemoveImage(int id, int imageId, CancellationToken ct)
    {
        var ordered = await db.DishImages.Where(i => i.DishId == id).OrderBy(i => i.DisplayOrder).ToListAsync(ct);
        var image = ordered.SingleOrDefault(i => i.Id == imageId);
        if (image is null)
            return NotFound();

        db.DishImages.Remove(image);
        ordered.Remove(image);
        Renumber(ordered, (i, n) => i.DisplayOrder = n);
        await db.SaveChangesAsync(ct);

        await images.DeleteAsync(image.PublicId, ct);
        return ToDto(await LoadAsync(id));
    }

    /// <summary>Sets the order of the dish's images (all of them, or 409 listChanged); the first one is the dish's main image.</summary>
    [HttpPut("{id:int}/images/order")]
    public async Task<ActionResult<DishDto>> ReorderImages(int id, ImageOrderInput input)
    {
        if (!await db.Dishes.AnyAsync(d => d.Id == id))
            return NotFound();
        var images = await db.DishImages.Where(i => i.DishId == id).ToListAsync();
        if (!SameIds(images.Select(i => i.Id), input.ImageIds))
            return Conflict("listChanged");

        Renumber(input.ImageIds!.Select(imageId => images.Single(i => i.Id == imageId)).ToList(), (i, n) => i.DisplayOrder = n);
        await db.SaveChangesAsync();
        return ToDto(await LoadAsync(id));
    }

    private async Task<int> NextOrderAsync(int categoryId) =>
        (await db.Dishes.Where(d => d.CategoryId == categoryId).MaxAsync(d => (int?)d.DisplayOrder) ?? -1) + 1;

    private async Task<ActionResult?> Validate(DishInput input, Dish dish)
    {
        var errors = new Errors();
        errors.Text(nameof(input.Name), input.Name, Dish.NameMaxLength, required: true);
        errors.Text(nameof(input.Description), input.Description, Dish.DescriptionMaxLength);
        errors.Text(nameof(input.AllergenInfo), input.AllergenInfo, AllergenMaxLength);
        if (!Enum.IsDefined(input.SellBy)) errors.Add(nameof(input.SellBy), "invalid");
        if (!Enum.IsDefined(input.ChoiceMode)) errors.Add(nameof(input.ChoiceMode), "invalid");

        if (!await db.Categories.AnyAsync(c => c.Id == input.CategoryId && !c.IsHidden))
            errors.Add(nameof(input.CategoryId), "notFound");

        if (input.ChoiceMode == ChoiceMode.Fixed)
            ValidateOptions(input, dish, errors);
        else if (input.ChoiceMode == ChoiceMode.Free)
            ValidateFreeChoice(input, errors);

        if (input.MaxPerSupplyDate is <= 0) errors.Add(nameof(input.MaxPerSupplyDate), "positive");
        else if (input.MaxPerSupplyDate is { } limit && limit >= 10_000_000) errors.Add(nameof(input.MaxPerSupplyDate), "invalid");
        else if (input.SellBy == SellBy.Units && input.MaxPerSupplyDate is { } units && units % 1 != 0)
            errors.Add(nameof(input.MaxPerSupplyDate), "wholeNumber");

        await ValidateAddOnLinks(input, dish, errors);
        return errors.Any ? Invalid(errors) : null;
    }

    private static void ValidateOptions(DishInput input, Dish dish, Errors errors)
    {
        var options = input.Options ?? [];
        if (options.Count == 0)
        {
            errors.Add(nameof(input.Options), "optionsRequired");
            return;
        }

        for (var i = 0; i < options.Count; i++)
        {
            var option = options[i];
            errors.Text($"options[{i}].label", option.Label, OptionLabelMaxLength, required: true);
            if (option.Amount <= 0) errors.Add($"options[{i}].amount", "positive");
            if (option.Price <= 0) errors.Add($"options[{i}].price", "positive");
            if (option.Id is { } id && dish.Options.All(o => o.Id != id))
                errors.Add($"options[{i}].id", "notFound");
        }

        // With one option it is the default; with several, exactly one must be chosen.
        if (options.Count > 1 && options.Count(o => o.IsDefault) != 1)
            errors.Add(nameof(input.Options), "oneDefault");
    }

    private static void ValidateFreeChoice(DishInput input, Errors errors)
    {
        void Positive(string field, decimal? value)
        {
            if (value is null) errors.Add(field, "required");
            else if (value <= 0) errors.Add(field, "positive");
            else if (input.SellBy == SellBy.Units && field != nameof(input.UnitPrice) && value % 1 != 0)
                errors.Add(field, "wholeNumber");
        }

        Positive(nameof(input.MinAmount), input.MinAmount);
        Positive(nameof(input.MaxAmount), input.MaxAmount);
        Positive(nameof(input.AmountStep), input.AmountStep);
        Positive(nameof(input.UnitPrice), input.UnitPrice);
        errors.Text(nameof(input.UnitName), input.UnitName, Dish.UnitNameMaxLength);
        if (input.MinAmount > 0 && input.MaxAmount > 0 && input.MaxAmount < input.MinAmount)
            errors.Add(nameof(input.MaxAmount), "belowMin");
    }

    private async Task ValidateAddOnLinks(DishInput input, Dish dish, Errors errors)
    {
        var parentIds = (input.ParentDishIds ?? []).Distinct().ToList();
        if (dish.Id != 0 && parentIds.Contains(dish.Id))
            errors.Add(nameof(input.ParentDishIds), "self");

        var parents = await db.Dishes.Where(d => parentIds.Contains(d.Id) && d.Id != dish.Id).ToListAsync();
        if (parents.Count != parentIds.Count(id => id != dish.Id) || parents.Any(p => p.IsHidden))
            errors.Add(nameof(input.ParentDishIds), "notFound");
        // Add-ons sit one level deep: an add-on-only dish cannot have add-ons of its own.
        if (parents.Any(p => p.IsAddOnOnly))
            errors.Add(nameof(input.ParentDishIds), "parentIsAddOnOnly");
        if (input.IsAddOnOnly && dish.Id != 0 && await db.DishAddOns.AnyAsync(a => a.ParentDishId == dish.Id))
            errors.Add(nameof(input.IsAddOnOnly), "hasAddOns");
    }

    private void Apply(DishInput input, Dish dish)
    {
        dish.Name = input.Name!.Trim();
        dish.CategoryId = input.CategoryId;
        dish.Description = Clean(input.Description);
        dish.AllergenInfo = Clean(input.AllergenInfo);
        dish.SellBy = input.SellBy;
        dish.ChoiceMode = input.ChoiceMode;
        dish.IsAddOnOnly = input.IsAddOnOnly;
        dish.IsSoldOut = input.IsSoldOut;
        dish.MaxPerSupplyDate = input.MaxPerSupplyDate;
        dish.OpenByDefault = input.OpenByDefault;
        dish.IsSideDish = input.IsSideDish;

        if (input.ChoiceMode == ChoiceMode.Fixed)
        {
            (dish.MinAmount, dish.MaxAmount, dish.AmountStep, dish.UnitPrice, dish.UnitName) = (null, null, null, null, null);
            ApplyOptions(input.Options!, dish);
        }
        else
        {
            (dish.MinAmount, dish.MaxAmount, dish.AmountStep, dish.UnitPrice, dish.UnitName) =
                (input.MinAmount, input.MaxAmount, input.AmountStep, input.UnitPrice, Clean(input.UnitName));
            db.DishOptions.RemoveRange(dish.Options);
        }

        var parentIds = (input.ParentDishIds ?? []).Distinct().ToHashSet();
        db.DishAddOns.RemoveRange(dish.AddOnOf.Where(a => !parentIds.Contains(a.ParentDishId)));
        foreach (var parentId in parentIds.Except(dish.AddOnOf.Select(a => a.ParentDishId)))
            dish.AddOnOf.Add(new DishAddOn { ParentDishId = parentId, AddOnDish = dish });
    }

    // Options keep their ids when edited, so saved favorites still point at them.
    private void ApplyOptions(List<OptionInput> inputs, Dish dish)
    {
        var keep = inputs.Where(o => o.Id is not null).Select(o => o.Id!.Value).ToHashSet();
        db.DishOptions.RemoveRange(dish.Options.Where(o => !keep.Contains(o.Id)));

        var single = inputs.Count == 1;
        foreach (var input in inputs)
        {
            var option = input.Id is { } id ? dish.Options.Single(o => o.Id == id) : null;
            if (option is null)
                dish.Options.Add(option = new DishOption { Label = "" });
            option.Label = input.Label!.Trim();
            option.Amount = input.Amount;
            option.Price = input.Price;
            option.IsDefault = single || input.IsDefault;
        }
    }

    private IQueryable<Dish> WithDetails() => db.Dishes
        .Include(d => d.Options)
        .Include(d => d.Images)
        .Include(d => d.AddOns)
        .Include(d => d.AddOnOf)
        .AsSplitQuery();

    private Task<Dish?> LoadOrNull(int id) => WithDetails().SingleOrDefaultAsync(d => d.Id == id);

    private async Task<Dish> LoadAsync(int id)
    {
        db.ChangeTracker.Clear();
        return await WithDetails().AsNoTracking().SingleAsync(d => d.Id == id);
    }

    private static DishDto ToDto(Dish d) => new(
        d.Id, d.Name, d.CategoryId, d.DisplayOrder, d.Description, d.AllergenInfo, d.SellBy, d.ChoiceMode,
        d.MinAmount, d.MaxAmount, d.AmountStep, d.UnitPrice, d.IsAddOnOnly, d.IsSoldOut, d.IsHidden,
        d.Options.OrderBy(o => o.Id).Select(o => new OptionDto(o.Id, o.Label, o.Amount, o.Price, o.IsDefault)).ToList(),
        d.Images.OrderBy(i => i.DisplayOrder).Select(i => new ImageDto(i.Id, i.Url, i.DisplayOrder)).ToList(),
        d.AddOnOf.Select(a => a.ParentDishId).Order().ToList(),
        d.AddOns.Select(a => a.AddOnDishId).Order().ToList(),
        d.MaxPerSupplyDate,
        d.OpenByDefault,
        d.IsSideDish,
        d.UnitName);
}
