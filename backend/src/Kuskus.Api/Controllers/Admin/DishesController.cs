using Kuskus.Api.Data;
using Kuskus.Api.Data.Entities;
using Kuskus.Api.Images;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using static Kuskus.Api.Controllers.Admin.Ordering;

namespace Kuskus.Api.Controllers.Admin;

[Route("api/admin/dishes")]
public class DishesController(AppDbContext db, IImageStore images) : AdminControllerBase
{
    public const int AllergenMaxLength = 500;
    public const int OptionLabelMaxLength = 50;

    public record OptionDto(int Id, string Label, decimal Amount, decimal Price, bool IsDefault);

    public record ImageDto(int Id, string Url, int DisplayOrder);

    public record DishDto(
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
        bool IsHidden,
        IReadOnlyList<OptionDto> Options,
        IReadOnlyList<ImageDto> Images,
        IReadOnlyList<int> ParentDishIds,
        IReadOnlyList<int> AddOnDishIds);

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
        List<int>? ParentDishIds);

    public record SoldOutInput(bool IsSoldOut);

    /// <summary>Every dish, removed ones included (IsHidden), for the admin lists.</summary>
    [HttpGet]
    public async Task<IEnumerable<DishDto>> GetAll() =>
        (await WithDetails().OrderBy(d => d.Name).ToListAsync()).Select(ToDto);

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

        Apply(input, dish);
        await db.SaveChangesAsync();
        return ToDto(await LoadAsync(id));
    }

    [HttpPut("{id:int}/sold-out")]
    public async Task<ActionResult> SetSoldOut(int id, SoldOutInput input)
    {
        var updated = await db.Dishes.Where(d => d.Id == id)
            .ExecuteUpdateAsync(s => s.SetProperty(d => d.IsSoldOut, input.IsSoldOut));
        return updated == 0 ? NotFound() : NoContent();
    }

    /// <summary>Removes a dish from the site. It is hidden, never deleted, so old orders still show it.</summary>
    [HttpDelete("{id:int}")]
    public async Task<ActionResult> Remove(int id)
    {
        var updated = await db.Dishes.Where(d => d.Id == id)
            .ExecuteUpdateAsync(s => s.SetProperty(d => d.IsHidden, true));
        return updated == 0 ? NotFound() : NoContent();
    }

    /// <summary>Brings a removed dish back, together with its category if that was removed too.</summary>
    [HttpPost("{id:int}/restore")]
    public async Task<ActionResult<DishDto>> Restore(int id)
    {
        var dish = await db.Dishes.Include(d => d.Category).SingleOrDefaultAsync(d => d.Id == id);
        if (dish is null)
            return NotFound();

        dish.IsHidden = false;
        if (dish.Category is { IsHidden: true } category)
        {
            category.IsHidden = false;
            category.DisplayOrder = (await db.Categories.Where(c => !c.IsHidden).MaxAsync(c => (int?)c.DisplayOrder) ?? -1) + 1;
        }
        await db.SaveChangesAsync();
        return ToDto(await LoadAsync(id));
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
            stored = await images.UploadAsync(stream, file.FileName, "kuskus/dishes", ct);
        }
        catch (ImageStoreUnavailableException)
        {
            return ImageStoreUnavailable();
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

    [HttpPost("{id:int}/images/{imageId:int}/move")]
    public async Task<ActionResult<DishDto>> MoveImage(int id, int imageId, MoveRequest request)
    {
        var ordered = await db.DishImages.Where(i => i.DishId == id).OrderBy(i => i.DisplayOrder).ToListAsync();
        var image = ordered.SingleOrDefault(i => i.Id == imageId);
        if (image is null)
            return NotFound();

        if (Ordering.Move(ordered, image, request.Direction, (i, n) => i.DisplayOrder = n))
            await db.SaveChangesAsync();
        return ToDto(await LoadAsync(id));
    }

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

        if (input.ChoiceMode == ChoiceMode.Fixed)
        {
            (dish.MinAmount, dish.MaxAmount, dish.AmountStep, dish.UnitPrice) = (null, null, null, null);
            ApplyOptions(input.Options!, dish);
        }
        else
        {
            (dish.MinAmount, dish.MaxAmount, dish.AmountStep, dish.UnitPrice) =
                (input.MinAmount, input.MaxAmount, input.AmountStep, input.UnitPrice);
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
        d.Id, d.Name, d.CategoryId, d.Description, d.AllergenInfo, d.SellBy, d.ChoiceMode,
        d.MinAmount, d.MaxAmount, d.AmountStep, d.UnitPrice, d.IsAddOnOnly, d.IsSoldOut, d.IsHidden,
        d.Options.OrderBy(o => o.Id).Select(o => new OptionDto(o.Id, o.Label, o.Amount, o.Price, o.IsDefault)).ToList(),
        d.Images.OrderBy(i => i.DisplayOrder).Select(i => new ImageDto(i.Id, i.Url, i.DisplayOrder)).ToList(),
        d.AddOnOf.Select(a => a.ParentDishId).Order().ToList(),
        d.AddOns.Select(a => a.AddOnDishId).Order().ToList());
}
