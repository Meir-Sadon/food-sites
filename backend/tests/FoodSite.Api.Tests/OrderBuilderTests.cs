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
}
