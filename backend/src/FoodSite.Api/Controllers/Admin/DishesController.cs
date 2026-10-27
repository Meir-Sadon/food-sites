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
        string? UnitName = null,
        int? MainDishId = null,
        bool UseMainDishPrice = false,
        bool IsYesNo = false,
        IReadOnlyList<AddOnGroupDto>? AddOnGroups = null,
        IReadOnlyList<AddOnLinkDto>? AddOns = null,
        IReadOnlyList<QuestionDto>? Questions = null,
        bool AdjustmentOptional = false,
        string? OptionsTitle = null,
        bool ShowOptionDifference = false,
        IReadOnlyList<string>? DietaryTags = null,
        bool DietaryTagsSingle = false,
        bool OnSale = false,
        IReadOnlyList<AvailabilityRuleDto>? Availability = null);

    public record QuestionDto(
        int Id, string Text, QuestionKind Kind, IReadOnlyList<string> Choices, bool ShowAsDropdown, bool IsRequired,
        string? DefaultAnswer = null);

    /// <summary>
    /// A question to keep (with Id) or add (without). Choices are for a single or multiple choice only. DefaultAnswer,
    /// for a choice or yes/no question, is the answer already picked for the client: one of the choices, or yes / no.
    /// </summary>
    public record QuestionInput(
        int? Id, string? Text, QuestionKind Kind, List<string>? Choices, bool ShowAsDropdown, bool IsRequired,
        string? DefaultAnswer = null);

    /// <param name="OverLimitPrice">Price per unit above MaxUnits; null means the limit is firm.</param>
    public record AddOnGroupDto(int Id, string Name, int? MaxUnits, decimal? OverLimitPrice = null);

    /// <summary>An add-on offered under this dish, in the admin's order, and how it is offered here.</summary>
    public record AddOnLinkDto(
        int DishId, int? GroupId, decimal? Price, decimal? MaxQuantity, bool IsCheckbox,
        int Slot = 0, string? Label = null, bool ShowImage = false, bool IsDefault = false, decimal? OverLimitPrice = null);

    /// <summary>A group to keep (with Id) or add (without).</summary>
    public record AddOnGroupInput(int? Id, string? Name, int? MaxUnits, decimal? OverLimitPrice = null);

    /// <summary>
    /// An add-on offered under this dish; Group is its group's index in AddOnGroups. The same add-on can be offered again
    /// (Slot 1, 2...) with a Label telling the offers apart. ShowImage shows its picture while the client adjusts the dish,
    /// IsDefault picks it for every unit until the client takes it off, OverLimitPrice (needs MaxQuantity) is the price
    /// per unit above MaxQuantity.
    /// </summary>
    public record AddOnLinkInput(
        int DishId, int? Group, decimal? Price, decimal? MaxQuantity, bool IsCheckbox,
        int Slot = 0, string? Label = null, bool ShowImage = false, bool IsDefault = false, decimal? OverLimitPrice = null);

    /// <summary>An option to keep (with Id) or add (without).</summary>
    public record OptionInput(int? Id, string? Label, decimal Amount, decimal Price, bool IsDefault);

    /// <summary>
    /// ParentDishIds lists the dishes this dish is offered under as an add-on, as ticked on this dish's form:
    /// ticking A and B on dish C makes C an add-on of A and B. Links A set up among its own add-ons are not listed and
    /// stay as they are.
    /// AddOns, when sent, is the whole list of this dish's own add-ons with their settings (and AddOnGroups its groups);
    /// left out, the add-ons stay as they are.
    /// MainDishId makes the dish a variant shown in that dish's card, in its category; with UseMainDishPrice it is
    /// priced like it and its own choice mode and options are not needed.
    /// Questions, when sent, is the whole list of the dish's questions; left out, they stay as they are.
    /// AdjustmentOptional (on unless sent false) lets the client order without adjusting each unit or answering its
    /// questions; a variant follows its main dish, so it is ignored there.
    /// OptionsTitle is the heading over the fixed options ("בחרו גודל"), ShowOptionDifference shows each option on the
    /// order page as what it adds to the default option's price; both only matter for fixed options.
    /// DietaryTags, when sent, is the whole list of the dish's special-diet marks (ids in <c>DietaryTags.All</c>); left out, they stay. DietaryTagsSingle (sent with them) lets the client pick only one.
    /// Availability, when sent, is the whole list of the times the dish is sold (a weekday, with From and To null for the whole day); empty means whenever the business works, left out they stay.
    /// CopyImagesFrom, on a new dish only, gives it the images of that dish (a copy of it); the picture files are shared.
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
        string? UnitName = null,
        int? MainDishId = null,
        bool UseMainDishPrice = false,
        bool IsYesNo = false,
        List<AddOnGroupInput>? AddOnGroups = null,
        List<AddOnLinkInput>? AddOns = null,
        List<QuestionInput>? Questions = null,
        int? CopyImagesFrom = null,
        bool AdjustmentOptional = true,
        string? OptionsTitle = null,
        bool ShowOptionDifference = false,
        List<string>? DietaryTags = null,
        bool DietaryTagsSingle = false,
        bool? OnSale = null,
        List<AvailabilityRuleDto>? Availability = null);

    public const decimal MaxAddOnPrice = 100_000;

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

        await ApplyAsync(input, dish);
        dish.DisplayOrder = await NextOrderAsync(dish.CategoryId);
        if (input.CopyImagesFrom is { } sourceId)
            dish.Images = await db.DishImages.AsNoTracking().Where(i => i.DishId == sourceId).OrderBy(i => i.DisplayOrder)
                .Select(i => new DishImage { Url = i.Url, PublicId = i.PublicId, DisplayOrder = i.DisplayOrder })
                .ToListAsync();
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
        if (input.CopyImagesFrom is not null)
            return Invalid(nameof(input.CopyImagesFrom), "invalid");
        if (await Validate(input, dish) is { } invalid)
            return invalid;

        // A dish moved to another category goes last there.
        var categoryId = await CategoryOfAsync(input);
        if (dish.CategoryId != categoryId)
            dish.DisplayOrder = await NextOrderAsync(categoryId);
        await ApplyAsync(input, dish);

        // Variants sit in their main dish's category, and the ones priced like it are sold the same way.
        foreach (var variant in await db.Dishes.Where(v => v.MainDishId == id).ToListAsync())
        {
            if (variant.CategoryId != dish.CategoryId)
                (variant.CategoryId, variant.DisplayOrder) = (dish.CategoryId, await NextOrderAsync(dish.CategoryId));
            if (variant.UseMainDishPrice)
                (variant.SellBy, variant.ChoiceMode) = (dish.SellBy, dish.ChoiceMode);
        }
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

        // A copied dish shares its picture files with the dish it was copied from.
        if (!await db.DishImages.AnyAsync(i => i.PublicId == image.PublicId, ct))
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

    /// <summary>The category a saved dish goes to: a variant's is its main dish's.</summary>
    private async Task<int> CategoryOfAsync(DishInput input) =>
        input.MainDishId is { } mainId
            ? await db.Dishes.Where(d => d.Id == mainId).Select(d => (int?)d.CategoryId).SingleOrDefaultAsync() ?? input.CategoryId
            : input.CategoryId;

    private async Task<int> NextOrderAsync(int categoryId) =>
        (await db.Dishes.Where(d => d.CategoryId == categoryId).MaxAsync(d => (int?)d.DisplayOrder) ?? -1) + 1;

    private async Task<ActionResult?> Validate(DishInput input, Dish dish)
    {
        var errors = new Errors();
        errors.Text(nameof(input.Name), input.Name, Dish.NameMaxLength, required: true);
        errors.Text(nameof(input.Description), input.Description, Dish.DescriptionMaxLength);
        errors.Text(nameof(input.AllergenInfo), input.AllergenInfo, AllergenMaxLength);
        if (input.DietaryTags?.Any(t => !Sites.DietaryTags.IsKnown(t)) == true) errors.Add(nameof(input.DietaryTags), "invalid");
        if (!Enum.IsDefined(input.SellBy)) errors.Add(nameof(input.SellBy), "invalid");
        if (!Enum.IsDefined(input.ChoiceMode)) errors.Add(nameof(input.ChoiceMode), "invalid");

        var main = await ValidateMainDish(input, dish, errors);
        if (main is null && !await db.Categories.AnyAsync(c => c.Id == input.CategoryId && !c.IsHidden))
            errors.Add(nameof(input.CategoryId), "notFound");

        // A variant priced like its main dish has no options or amounts of its own.
        var ownPrice = !(input.UseMainDishPrice && input.MainDishId is not null);
        if (ownPrice && input.ChoiceMode == ChoiceMode.Fixed)
            ValidateOptions(input, dish, errors);
        else if (ownPrice && input.ChoiceMode == ChoiceMode.Free)
            ValidateFreeChoice(input, errors);

        if (input.MaxPerSupplyDate is <= 0) errors.Add(nameof(input.MaxPerSupplyDate), "positive");
        else if (input.MaxPerSupplyDate is { } limit && limit >= 10_000_000) errors.Add(nameof(input.MaxPerSupplyDate), "invalid");
        else if (input.SellBy == SellBy.Units && input.MaxPerSupplyDate is { } units && units % 1 != 0)
            errors.Add(nameof(input.MaxPerSupplyDate), "wholeNumber");

        await ValidateAddOnLinks(input, dish, errors);
        await ValidateOwnAddOns(input, dish, errors);
        ValidateQuestions(input, dish, errors);
        DishAvailability.Validate(input.Availability, errors);
        if (input.CopyImagesFrom is { } sourceId && !await db.Dishes.AnyAsync(d => d.Id == sourceId))
            errors.Add(nameof(input.CopyImagesFrom), "notFound");
        return errors.Any ? Invalid(errors) : null;
    }

    /// <summary>A variant's main dish: a dish on the site that is not a variant itself, while this dish has no variants.</summary>
    private async Task<Dish?> ValidateMainDish(DishInput input, Dish dish, Errors errors)
    {
        if (input.MainDishId is not { } mainId)
        {
            if (input.UseMainDishPrice)
                errors.Add(nameof(input.UseMainDishPrice), "noMainDish");
            if (input.IsAddOnOnly && dish.Id != 0 && await db.Dishes.AnyAsync(v => v.MainDishId == dish.Id && !v.IsHidden))
                errors.Add(nameof(input.IsAddOnOnly), "hasVariants");
            return null;
        }

        var main = await db.Dishes.SingleOrDefaultAsync(d => d.Id == mainId);
        if (main is null || main.IsHidden || main.Id == dish.Id)
            errors.Add(nameof(input.MainDishId), "notFound");
        else if (main.MainDishId is not null)
            errors.Add(nameof(input.MainDishId), "mainIsVariant");
        else if (main.IsAddOnOnly)
            errors.Add(nameof(input.MainDishId), "mainIsAddOnOnly");
        if (dish.Id != 0 && await db.Dishes.AnyAsync(v => v.MainDishId == dish.Id && !v.IsHidden))
            errors.Add(nameof(input.MainDishId), "hasVariants");
        if (input.IsAddOnOnly)
            errors.Add(nameof(input.IsAddOnOnly), "variantAddOnOnly");
        return main;
    }

    private async Task ValidateOwnAddOns(DishInput input, Dish dish, Errors errors)
    {
        if (input.AddOns is null)
            return;

        var groups = input.AddOnGroups ?? [];
        for (var i = 0; i < groups.Count; i++)
        {
            errors.Text($"addOnGroups[{i}].name", groups[i].Name, AddOnGroup.NameMaxLength, required: true);
            if (groups[i].MaxUnits is < 1 or > OrderBuilder.MaxUnits)
                errors.Add($"addOnGroups[{i}].maxUnits", "invalid");
            if (groups[i].OverLimitPrice is { } groupOver)
            {
                if (groupOver is < 0 or >= MaxAddOnPrice) errors.Add($"addOnGroups[{i}].overLimitPrice", "invalid");
                else if (groups[i].MaxUnits is null) errors.Add($"addOnGroups[{i}].overLimitPrice", "overLimitNeedsLimit");
            }
            if (groups[i].Id is { } id && dish.AddOnGroups.All(g => g.Id != id))
                errors.Add($"addOnGroups[{i}].id", "notFound");
        }

        var ids = input.AddOns.Select(a => a.DishId).ToList();
        var addOnDishes = await db.Dishes.Where(d => ids.Contains(d.Id)).ToDictionaryAsync(d => d.Id);
        var seen = new HashSet<(int, int)>();
        for (var i = 0; i < input.AddOns.Count; i++)
        {
            var addOn = input.AddOns[i];
            var path = $"addOns[{i}]";
            if (addOn.Slot is < 0 or >= DishAddOn.MaxSlots)
                errors.Add($"{path}.slot", "invalid");
            errors.Text($"{path}.label", addOn.Label, DishAddOn.LabelMaxLength);
            // An add-on offered more than once needs a name for each offer.
            if (input.AddOns.Count(a => a.DishId == addOn.DishId) > 1)
            {
                if (string.IsNullOrWhiteSpace(addOn.Label))
                    errors.Add($"{path}.label", "required");
                else if (input.AddOns.Take(i).Any(a => a.DishId == addOn.DishId
                    && string.Equals(a.Label?.Trim(), addOn.Label.Trim(), StringComparison.OrdinalIgnoreCase)))
                    errors.Add($"{path}.label", "duplicate");
            }
            // A removed add-on that is already offered here can be kept or taken off, but not newly added.
            if (!addOnDishes.TryGetValue(addOn.DishId, out var addOnDish)
                || (addOnDish.IsHidden && dish.AddOns.All(a => a.AddOnDishId != addOn.DishId)) || addOn.DishId == dish.Id)
                errors.Add($"{path}.dishId", "notFound");
            else if (!seen.Add((addOn.DishId, addOn.Slot)))
                errors.Add($"{path}.dishId", "duplicate");
            if (addOn.Price is < 0 or >= MaxAddOnPrice)
                errors.Add($"{path}.price", "invalid");
            if (addOn.OverLimitPrice is { } over)
            {
                if (over is < 0 or >= MaxAddOnPrice) errors.Add($"{path}.overLimitPrice", "invalid");
                else if (addOn.MaxQuantity is null) errors.Add($"{path}.overLimitPrice", "overLimitNeedsLimit");
            }
            if (addOn.MaxQuantity is <= 0) errors.Add($"{path}.maxQuantity", "positive");
            else if (addOn.MaxQuantity is > OrderBuilder.MaxUnits) errors.Add($"{path}.maxQuantity", "invalid");
            if (addOn.Group is { } group && (group < 0 || group >= groups.Count))
                errors.Add($"{path}.group", "notFound");
        }
        // The add-ons picked by default must fit their group's limit together.
        for (var g = 0; g < groups.Count; g++)
            if (groups[g].MaxUnits is { } limit && input.AddOns.Count(a => a.Group == g && a.IsDefault) > limit)
                errors.Add($"addOnGroups[{g}].maxUnits", "defaultsExceedLimit");
        if (input.IsAddOnOnly && input.AddOns.Count > 0)
            errors.Add(nameof(input.IsAddOnOnly), "hasAddOns");
    }

    private static void ValidateQuestions(DishInput input, Dish dish, Errors errors)
    {
        if (input.Questions is not { } questions)
            return;
        if (questions.Count > DishQuestion.MaxPerDish)
        {
            errors.Add(nameof(input.Questions), "tooManyQuestions");
            return;
        }

        for (var i = 0; i < questions.Count; i++)
        {
            var question = questions[i];
            var path = $"questions[{i}]";
            errors.Text($"{path}.text", question.Text, DishQuestion.TextMaxLength, required: true);
            if (!Enum.IsDefined(question.Kind))
                errors.Add($"{path}.kind", "invalid");
            if (question.Id is { } id && dish.Questions.All(q => q.Id != id))
                errors.Add($"{path}.id", "notFound");
            var choices = (question.Choices ?? []).Select(c => c?.Trim() ?? "").ToList();
            if (Clean(question.DefaultAnswer) is { } answer && !DefaultAnswerFits(question.Kind, choices, answer))
                errors.Add($"{path}.defaultAnswer", "defaultAnswerInvalid");
            if (question.Kind is not (QuestionKind.SingleChoice or QuestionKind.MultiChoice))
                continue;

            if (choices.Count < (question.Kind == QuestionKind.SingleChoice ? 2 : 1))
                errors.Add($"{path}.choices", "choicesRequired");
            else if (choices.Count > DishQuestion.MaxChoices)
                errors.Add($"{path}.choices", "tooManyChoices");
            else if (choices.Any(c => c == "" || c.Length > DishQuestion.ChoiceMaxLength))
                errors.Add($"{path}.choices", "choiceInvalid");
            else if (choices.Distinct().Count() != choices.Count)
                errors.Add($"{path}.choices", "duplicateChoice");
        }
    }

    private static bool DefaultAnswerFits(QuestionKind kind, List<string> choices, string answer) => kind switch
    {
        QuestionKind.YesNo => answer is "yes" or "no",
        QuestionKind.SingleChoice or QuestionKind.MultiChoice => choices.Contains(answer),
        _ => false,
    };

    private static void ValidateOptions(DishInput input, Dish dish, Errors errors)
    {
        var options = input.Options ?? [];
        if (options.Count == 0)
        {
            errors.Add(nameof(input.Options), "optionsRequired");
            return;
        }

        errors.Text(nameof(input.OptionsTitle), input.OptionsTitle, Dish.OptionsTitleMaxLength);
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
        // A removed dish the link already exists to can stay linked (it is not shown to the admin, so it can't be dealt with first).
        var linked = dish.AddOnOf.Select(a => a.ParentDishId).ToHashSet();
        if (parents.Count != parentIds.Count(id => id != dish.Id) || parents.Any(p => p.IsHidden && !linked.Contains(p.Id)))
            errors.Add(nameof(input.ParentDishIds), "notFound");
        // Add-ons sit one level deep: an add-on-only dish cannot have add-ons of its own.
        if (parents.Any(p => p.IsAddOnOnly && !linked.Contains(p.Id)))
            errors.Add(nameof(input.ParentDishIds), "parentIsAddOnOnly");
        if (input.IsAddOnOnly && input.AddOns is null && dish.Id != 0 && await db.DishAddOns.AnyAsync(a => a.ParentDishId == dish.Id))
            errors.Add(nameof(input.IsAddOnOnly), "hasAddOns");
    }

    private async Task ApplyAsync(DishInput input, Dish dish)
    {
        var main = input.MainDishId is { } mainId ? await db.Dishes.SingleAsync(d => d.Id == mainId) : null;
        dish.Name = input.Name!.Trim();
        dish.CategoryId = main?.CategoryId ?? input.CategoryId;
        dish.MainDishId = main?.Id;
        dish.UseMainDishPrice = main is not null && input.UseMainDishPrice;
        dish.IsYesNo = input.IsYesNo;
        dish.AdjustmentOptional = main is null && input.AdjustmentOptional;
        dish.Description = Clean(input.Description);
        dish.AllergenInfo = Clean(input.AllergenInfo);
        if (input.DietaryTags is not null)
        {
            dish.DietaryTags = Sites.DietaryTags.Clean(input.DietaryTags);
            dish.DietaryTagsSingle = input.DietaryTagsSingle;
        }
        dish.SellBy = input.SellBy;
        dish.ChoiceMode = input.ChoiceMode;
        dish.IsAddOnOnly = input.IsAddOnOnly;
        dish.IsSoldOut = input.IsSoldOut;
        // Missing (an older client) keeps the mark.
        if (input.OnSale is { } onSale)
            dish.OnSale = onSale;
        dish.MaxPerSupplyDate = input.MaxPerSupplyDate;
        dish.OpenByDefault = input.OpenByDefault;
        dish.IsSideDish = input.IsSideDish;

        (dish.OptionsTitle, dish.ShowOptionDifference) = (null, false);
        if (dish.UseMainDishPrice)
        {
            // Sold the same way as the main dish, so per-date and portion limits count it the same way.
            (dish.SellBy, dish.ChoiceMode) = (main!.SellBy, main.ChoiceMode);
            (dish.MinAmount, dish.MaxAmount, dish.AmountStep, dish.UnitPrice, dish.UnitName) = (null, null, null, null, null);
            db.DishOptions.RemoveRange(dish.Options);
        }
        else if (input.ChoiceMode == ChoiceMode.Fixed)
        {
            (dish.MinAmount, dish.MaxAmount, dish.AmountStep, dish.UnitPrice, dish.UnitName) = (null, null, null, null, null);
            ApplyOptions(input.Options!, dish);
            dish.OptionsTitle = Clean(input.OptionsTitle);
            dish.ShowOptionDifference = input.ShowOptionDifference;
        }
        else
        {
            (dish.MinAmount, dish.MaxAmount, dish.AmountStep, dish.UnitPrice, dish.UnitName) =
                (input.MinAmount, input.MaxAmount, input.AmountStep, input.UnitPrice, Clean(input.UnitName));
            db.DishOptions.RemoveRange(dish.Options);
        }

        // Only the links ticked on this form are this form's; the ones a parent set up among its own add-ons stay.
        var parentIds = (input.ParentDishIds ?? []).Distinct().ToHashSet();
        db.DishAddOns.RemoveRange(dish.AddOnOf.Where(a => a.LinkedFromAddOn && a.Slot == 0 && !parentIds.Contains(a.ParentDishId)));
        foreach (var link in dish.AddOnOf.Where(a => a.Slot == 0 && parentIds.Contains(a.ParentDishId)))
            link.LinkedFromAddOn = true;
        foreach (var parentId in parentIds.Except(dish.AddOnOf.Where(a => a.Slot == 0).Select(a => a.ParentDishId)))
            dish.AddOnOf.Add(new DishAddOn { ParentDishId = parentId, AddOnDish = dish, LinkedFromAddOn = true });

        if (input.AddOns is not null)
            ApplyOwnAddOns(input.AddOnGroups ?? [], input.AddOns, dish);
        if (input.Questions is not null)
            ApplyQuestions(input.Questions, dish);
        if (input.Availability is not null)
            DishAvailability.Apply(input.Availability, dish);
    }

    // Questions keep their ids when edited, so an order page already open still matches them.
    private void ApplyQuestions(List<QuestionInput> inputs, Dish dish)
    {
        var keep = inputs.Where(q => q.Id is not null).Select(q => q.Id!.Value).ToHashSet();
        db.DishQuestions.RemoveRange(dish.Questions.Where(q => !keep.Contains(q.Id)));
        for (var i = 0; i < inputs.Count; i++)
        {
            var input = inputs[i];
            var question = input.Id is { } id ? dish.Questions.Single(q => q.Id == id) : null;
            if (question is null)
                dish.Questions.Add(question = new DishQuestion { Text = "" });
            var choices = input.Kind is QuestionKind.SingleChoice or QuestionKind.MultiChoice;
            question.Text = input.Text!.Trim();
            question.Kind = input.Kind;
            question.Choices = choices ? input.Choices!.Select(c => c.Trim()).ToList() : [];
            question.ShowAsDropdown = input.Kind == QuestionKind.SingleChoice && input.ShowAsDropdown;
            question.IsRequired = input.IsRequired;
            question.DefaultAnswer = input.Kind is QuestionKind.YesNo || choices ? Clean(input.DefaultAnswer) : null;
            question.DisplayOrder = i;
        }
    }

    // Groups keep their ids when edited; links are matched by the add-on dish.
    private void ApplyOwnAddOns(List<AddOnGroupInput> groupInputs, List<AddOnLinkInput> addOnInputs, Dish dish)
    {
        var keepGroups = groupInputs.Where(g => g.Id is not null).Select(g => g.Id!.Value).ToHashSet();
        var groups = groupInputs.Select((input, index) =>
        {
            var group = input.Id is { } id ? dish.AddOnGroups.Single(g => g.Id == id) : null;
            if (group is null)
                dish.AddOnGroups.Add(group = new AddOnGroup { Name = "" });
            group.Name = input.Name!.Trim();
            group.MaxUnits = input.MaxUnits;
            group.OverLimitPrice = input.MaxUnits is null ? null : input.OverLimitPrice;
            group.DisplayOrder = index;
            return group;
        }).ToList();

        var keepAddOns = addOnInputs.Select(a => (a.DishId, a.Slot)).ToHashSet();
        db.DishAddOns.RemoveRange(dish.AddOns.Where(a => !keepAddOns.Contains((a.AddOnDishId, a.Slot))));
        for (var i = 0; i < addOnInputs.Count; i++)
        {
            var input = addOnInputs[i];
            var link = dish.AddOns.SingleOrDefault(a => a.AddOnDishId == input.DishId && a.Slot == input.Slot);
            if (link is null)
                dish.AddOns.Add(link = new DishAddOn { ParentDish = dish, AddOnDishId = input.DishId, Slot = input.Slot });
            link.Label = Clean(input.Label);
            link.ShowImage = input.ShowImage;
            link.IsDefault = input.IsDefault;
            link.OverLimitPrice = input.MaxQuantity is null ? null : input.OverLimitPrice;
            link.DisplayOrder = i;
            link.Group = input.Group is { } g ? groups[g] : null;
            if (link.Group is null)
                link.GroupId = null;
            link.Price = input.Price;
            link.MaxQuantity = input.MaxQuantity;
            link.IsCheckbox = input.IsCheckbox;
        }
        db.AddOnGroups.RemoveRange(dish.AddOnGroups.Where(g => g.Id != 0 && !keepGroups.Contains(g.Id)));
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
        .Include(d => d.AddOnGroups)
        .Include(d => d.Questions)
        .Include(d => d.AvailabilityRules)
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
        d.AddOnOf.Where(a => a.LinkedFromAddOn).Select(a => a.ParentDishId).Order().ToList(),
        d.AddOns.Select(a => a.AddOnDishId).Distinct().Order().ToList(),
        d.MaxPerSupplyDate,
        d.OpenByDefault,
        d.IsSideDish,
        d.UnitName,
        d.MainDishId,
        d.UseMainDishPrice,
        d.IsYesNo,
        d.AddOnGroups.OrderBy(g => g.DisplayOrder).Select(g => new AddOnGroupDto(g.Id, g.Name, g.MaxUnits, g.OverLimitPrice)).ToList(),
        d.AddOns.OrderBy(a => a.DisplayOrder).ThenBy(a => a.AddOnDishId).ThenBy(a => a.Slot)
            .Select(a => new AddOnLinkDto(
                a.AddOnDishId, a.GroupId, a.Price, a.MaxQuantity, a.IsCheckbox, a.Slot, a.Label, a.ShowImage, a.IsDefault, a.OverLimitPrice)).ToList(),
        d.Questions.OrderBy(q => q.DisplayOrder).ThenBy(q => q.Id)
            .Select(q => new QuestionDto(q.Id, q.Text, q.Kind, q.Choices, q.ShowAsDropdown, q.IsRequired, q.DefaultAnswer)).ToList(),
        d.AdjustmentOptional,
        d.OptionsTitle,
        d.ShowOptionDifference,
        d.DietaryTags,
        d.DietaryTagsSingle,
        d.OnSale,
        DishAvailability.ToDtos(d.AvailabilityRules));
}
