using FoodSite.Api.Controllers.Admin;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Orders;

namespace FoodSite.Api.Tests;

public class OrderBuilderTests
{
    private static Dish Fixed(int id, string name, params (int Id, string Label, decimal Price, bool Default)[] options) => new()
    {
        Id = id,
        Name = name,
        SellBy = SellBy.Units,
        ChoiceMode = ChoiceMode.Fixed,
        Options = [.. options.Select(o => new DishOption { Id = o.Id, DishId = id, Label = o.Label, Amount = 1, Price = o.Price, IsDefault = o.Default })],
    };

    private static Dish FreeWeight(int id) => new()
    {
        Id = id,
        Name = "בשר",
        SellBy = SellBy.Weight,
        ChoiceMode = ChoiceMode.Free,
        MinAmount = 0.5m,
        MaxAmount = 3m,
        AmountStep = 0.25m,
        UnitPrice = 90m,
    };

    private static Dictionary<int, Dish> Menu(params Dish[] dishes) => dishes.ToDictionary(d => d.Id);

    private static (List<OrderItem> Items, Errors Errors) Build(Dictionary<int, Dish> dishes, params OrderLineInput[] lines)
    {
        var errors = new Errors();
        return (OrderBuilder.Build(lines, dishes, errors), errors);
    }

    private static bool Has(Errors errors, string field, string code) =>
        errors.ToDictionary().TryGetValue(field, out var codes) && codes.Contains(code);

    [Fact]
    public void Prices_and_names_come_from_the_dish_not_the_client()
    {
        var chicken = Fixed(1, "עוף", (10, "חצי", 40, false), (11, "שלם", 70, true));
        var (items, errors) = Build(Menu(chicken), new OrderLineInput(1, 10, 2, null));

        Assert.False(errors.Any);
        var item = Assert.Single(items);
        Assert.Equal(("עוף", "חצי", 2m, 40m, 80m), (item.DishName, item.OptionLabel, item.Quantity, item.UnitPrice, item.LineTotal));
        Assert.Equal(80m, OrderBuilder.Total(items));
    }

    [Fact]
    public void Missing_option_uses_the_default()
    {
        var chicken = Fixed(1, "עוף", (10, "חצי", 40, false), (11, "שלם", 70, true));
        var (items, _) = Build(Menu(chicken), new OrderLineInput(1, null, 1, null));
        Assert.Equal("שלם", items.Single().OptionLabel);
    }

    [Fact]
    public void Free_choice_dish_is_priced_per_unit_of_amount()
    {
        var (items, errors) = Build(Menu(FreeWeight(2)), new OrderLineInput(2, null, 1.75m, null));
        Assert.False(errors.Any);
        Assert.Equal(157.5m, items.Single().LineTotal);
    }

    [Fact]
    public void Free_choice_line_is_labelled_with_the_dish_unit_name()
    {
        var trays = FreeWeight(2);
        (trays.SellBy, trays.MinAmount, trays.AmountStep, trays.UnitName) = (SellBy.Units, 1m, 1m, "מגש של 50");
        var (items, _) = Build(Menu(FreeWeight(1), trays), new OrderLineInput(1, null, 1m, null), new OrderLineInput(2, null, 2m, null));

        Assert.Equal(["ק״ג", "מגש של 50"], items.Select(i => i.OptionLabel));
    }

    [Theory]
    [InlineData(0.25)]
    [InlineData(3.25)]
    [InlineData(0.6)]
    public void Free_choice_amount_must_fit_the_range_and_step(double amount)
    {
        var (_, errors) = Build(Menu(FreeWeight(2)), new OrderLineInput(2, null, (decimal)amount, null));
        Assert.True(Has(errors, "items[0].quantity", "quantityInvalid"));
    }

    [Theory]
    [InlineData(0.0)]
    [InlineData(-1.0)]
    [InlineData(1.5)]
    [InlineData(100.0)]
    public void Fixed_dish_quantity_must_be_a_whole_number_of_units(double quantity)
    {
        var (_, errors) = Build(Menu(Fixed(1, "עוף", (10, "מנה", 40, true))), new OrderLineInput(1, null, (decimal)quantity, null));
        Assert.True(Has(errors, "items[0].quantity", "quantityInvalid"));
    }

    [Fact]
    public void Option_of_another_dish_is_rejected()
    {
        var menu = Menu(Fixed(1, "עוף", (10, "מנה", 40, true)), Fixed(2, "אורז", (20, "מנה", 15, true)));
        var (_, errors) = Build(menu, new OrderLineInput(1, 20, 1, null));
        Assert.True(Has(errors, "items[0].optionId", "optionInvalid"));
    }

    [Fact]
    public void Unavailable_dishes_are_rejected()
    {
        var soldOut = Fixed(1, "עוף", (10, "מנה", 40, true));
        soldOut.IsSoldOut = true;
        var hidden = Fixed(2, "דג", (20, "מנה", 40, true));
        hidden.IsHidden = true;
        var addOnOnly = Fixed(3, "שוק", (30, "יחידה", 10, true));
        addOnOnly.IsAddOnOnly = true;

        var (_, errors) = Build(Menu(soldOut, hidden, addOnOnly),
            new OrderLineInput(1, null, 1, null), new OrderLineInput(2, null, 1, null),
            new OrderLineInput(3, null, 1, null), new OrderLineInput(99, null, 1, null));

        for (var i = 0; i < 4; i++)
            Assert.True(Has(errors, $"items[{i}]", "dishUnavailable"));
    }

    [Fact]
    public void Add_ons_are_priced_at_their_own_price_and_linked_to_the_parent()
    {
        var chicken = Fixed(1, "עוף", (10, "מנה", 50, true));
        var thigh = Fixed(2, "ירך", (20, "יחידה", 12, true));
        thigh.IsAddOnOnly = true;
        chicken.AddOns = [new DishAddOn { ParentDishId = 1, AddOnDishId = 2 }];

        var (items, errors) = Build(Menu(chicken, thigh), new OrderLineInput(1, null, 2, [new AddOnInput(2, null, 3)]));

        Assert.False(errors.Any);
        var parent = items.Single(i => i.DishId == 1);
        var addOn = items.Single(i => i.DishId == 2);
        Assert.Same(parent, addOn.ParentItem);
        Assert.Equal(36m, addOn.LineTotal);
        Assert.Equal(136m, OrderBuilder.Total(items));
    }

    [Fact]
    public void Add_on_must_be_linked_to_the_dish_and_not_repeated()
    {
        var chicken = Fixed(1, "עוף", (10, "מנה", 50, true));
        var rice = Fixed(2, "אורז", (20, "מנה", 15, true));
        var thigh = Fixed(3, "ירך", (30, "יחידה", 12, true));
        chicken.AddOns = [new DishAddOn { ParentDishId = 1, AddOnDishId = 3 }];

        var (_, errors) = Build(Menu(chicken, rice, thigh),
            new OrderLineInput(1, null, 1, [new AddOnInput(2, null, 1), new AddOnInput(3, null, 1), new AddOnInput(3, null, 1)]));

        Assert.True(Has(errors, "items[0].addOns[0]", "addOnUnavailable"));
        Assert.True(Has(errors, "items[0].addOns[2]", "addOnUnavailable"));
        Assert.False(Has(errors, "items[0].addOns[1]", "addOnUnavailable"));
    }

    [Fact]
    public void Empty_order_is_rejected()
    {
        var (_, errors) = Build(Menu());
        Assert.True(Has(errors, "items", "emptyOrder"));
    }

    private static DishAddOn Link(Dish parent, Dish addOn, decimal? price = null, decimal? max = null, bool checkbox = false, AddOnGroup? group = null)
    {
        var link = new DishAddOn
        {
            ParentDish = parent, ParentDishId = parent.Id, AddOnDish = addOn, AddOnDishId = addOn.Id,
            Price = price, MaxQuantity = max, IsCheckbox = checkbox, Group = group, GroupId = group?.Id,
        };
        parent.AddOns.Add(link);
        return link;
    }

    [Fact]
    public void Add_on_price_under_a_parent_replaces_its_own_and_uses_the_default_option()
    {
        var couscous = Fixed(1, "קוסקוס", (10, "מנה", 50, true));
        var chicken = Fixed(2, "עוף", (20, "חצי", 7, false), (21, "יחידה", 12, true));
        Link(couscous, chicken, price: 8);
        var (items, errors) = Build(Menu(couscous, chicken), new OrderLineInput(1, 10, 1, [new AddOnInput(2, 20, 2)]));

        Assert.False(errors.Any);
        Assert.Equal(("יחידה", 8m, 16m), (items[1].OptionLabel, items[1].UnitPrice, items[1].LineTotal));
    }

    [Fact]
    public void Add_on_and_group_limits_grow_with_the_ordered_quantity()
    {
        var couscous = Fixed(1, "קוסקוס", (10, "מנה", 50, true));
        var chicken = Fixed(2, "עוף", (20, "יחידה", 12, true));
        var group = new AddOnGroup { Id = 5, DishId = 1, Name = "תוספות", MaxUnits = 2 };
        Link(couscous, chicken, price: 8, max: 2, group: group);
        var menu = Menu(couscous, chicken);

        var (_, four) = Build(menu, new OrderLineInput(1, null, 2, [new AddOnInput(2, null, 4)]));
        var (_, five) = Build(menu, new OrderLineInput(1, null, 2, [new AddOnInput(2, null, 5)]));
        var (_, perPortion) = Build(menu, new OrderLineInput(1, null, 1, [new AddOnInput(2, null, 3)]));

        Assert.False(four.Any);
        Assert.True(Has(five, "items[0].addOns[0].quantity", "addOnLimit"));
        Assert.True(Has(perPortion, "items[0].addOns[0].quantity", "addOnLimit"));
    }

    [Fact]
    public void Add_on_price_can_be_zero()
    {
        var sandwich = Fixed(1, "כריך", (10, "כריך", 30, true));
        var hummus = Fixed(2, "חומוס", (20, "קופסה", 15, true));
        Link(sandwich, hummus, price: 0, checkbox: true);
        var (items, errors) = Build(Menu(sandwich, hummus), new OrderLineInput(1, null, 1, [new AddOnInput(2, null, 1)]));

        Assert.False(errors.Any);
        Assert.Equal(30m, OrderBuilder.Total(items));
    }

    [Fact]
    public void Add_on_above_its_limit_under_the_parent_is_rejected()
    {
        var couscous = Fixed(1, "קוסקוס", (10, "מנה", 50, true));
        var chicken = Fixed(2, "עוף", (20, "יחידה", 12, true));
        Link(couscous, chicken, price: 8, max: 2);
        var (_, errors) = Build(Menu(couscous, chicken), new OrderLineInput(1, null, 1, [new AddOnInput(2, null, 3)]));

        Assert.True(Has(errors, "items[0].addOns[0].quantity", "addOnLimit"));
    }

    [Fact]
    public void Check_box_add_on_is_one_default_whatever_the_client_sends()
    {
        var sandwich = Fixed(1, "כריך", (10, "כריך", 30, true));
        var salad = Fixed(2, "סלט", (20, "קטן", 10, true), (21, "גדול", 20, false));
        Link(sandwich, salad, checkbox: true);
        var (items, errors) = Build(Menu(sandwich, salad), new OrderLineInput(1, null, 1, [new AddOnInput(2, 21, 5)]));

        Assert.False(errors.Any);
        Assert.Equal(("קטן", 1m, 10m), (items[1].OptionLabel, items[1].Quantity, items[1].LineTotal));
    }

    [Fact]
    public void Yes_no_dish_is_ordered_once()
    {
        var bread = Fixed(1, "לחם", (10, "כיכר", 12, true));
        bread.IsYesNo = true;
        var (items, errors) = Build(Menu(bread), new OrderLineInput(1, null, 4, null));

        Assert.False(errors.Any);
        Assert.Equal((1m, 12m), (items.Single().Quantity, items.Single().LineTotal));
    }

    [Fact]
    public void Add_on_group_limits_the_units_picked_from_it_together()
    {
        var sandwich = Fixed(1, "כריך", (10, "כריך", 30, true));
        var salads = new AddOnGroup { Id = 5, DishId = 1, Name = "סלטים", MaxUnits = 2 };
        var picks = Enumerable.Range(2, 3).Select(id => Fixed(id, $"סלט {id}", (id * 10, "כף", 0, true))).ToList();
        foreach (var salad in picks)
            Link(sandwich, salad, checkbox: true, group: salads);
        var menu = Menu([sandwich, .. picks]);

        var (_, two) = Build(menu, new OrderLineInput(1, null, 1, [new AddOnInput(2, null, 1), new AddOnInput(3, null, 1)]));
        var (_, three) = Build(menu, new OrderLineInput(1, null, 1, [new AddOnInput(2, null, 1), new AddOnInput(3, null, 1), new AddOnInput(4, null, 1)]));

        Assert.False(two.Any);
        Assert.True(Has(three, "items[0].addOns", "addOnGroupLimit"));
    }

    [Fact]
    public void Variant_is_priced_like_its_main_dish_and_listed_under_its_own_name()
    {
        var cigars = Fixed(1, "סיגרים עבודת יד", (10, "10 יח׳", 60, true), (11, "20 יח׳", 110, false));
        var liver = new Dish { Id = 2, Name = "סיגר כבד", MainDishId = 1, MainDish = cigars, UseMainDishPrice = true };
        var beef = Fixed(3, "סיגר אנטריקוט", (30, "10 יח׳", 80, true));
        (beef.MainDishId, beef.MainDish) = (1, cigars);
        var (items, errors) = Build(Menu(cigars, liver, beef), new OrderLineInput(2, 11, 1, null), new OrderLineInput(3, null, 1, null));

        Assert.False(errors.Any);
        Assert.Equal([("סיגר כבד", "20 יח׳", 110m), ("סיגר אנטריקוט", "10 יח׳", 80m)], items.Select(i => (i.DishName, i.OptionLabel, i.LineTotal)));
    }

    [Fact]
    public void Variant_offers_its_main_dish_add_ons_and_is_unavailable_when_the_main_dish_is_sold_out()
    {
        var cigars = Fixed(1, "סיגרים", (10, "מגש", 60, true));
        var sauce = Fixed(4, "רוטב", (40, "כוס", 5, true));
        Link(cigars, sauce, price: 3);
        var liver = new Dish { Id = 2, Name = "סיגר כבד", MainDishId = 1, MainDish = cigars, UseMainDishPrice = true };
        var menu = Menu(cigars, liver, sauce);

        var (items, errors) = Build(menu, new OrderLineInput(2, null, 1, [new AddOnInput(4, null, 1)]));
        Assert.False(errors.Any);
        Assert.Equal(63m, OrderBuilder.Total(items));

        cigars.IsSoldOut = true;
        var (_, soldOut) = Build(menu, new OrderLineInput(2, null, 1, null));
        Assert.True(Has(soldOut, "items[0]", "dishUnavailable"));
    }
}
