using FoodSite.Api.Data.Entities;
using FoodSite.Api.Orders;

namespace FoodSite.Api.Tests;

/// <summary>A price list's general discount: the rounding and which discount wins. No database.</summary>
public class PriceListDiscountRulesTests
{
    [Theory]
    [InlineData(55, 10, 50)]
    [InlineData(70, 15, 60)]
    [InlineData(100, 10, 90)]
    [InlineData(0.5, 10, 0.5)]
    [InlineData(0, 10, 0)]
    public void The_general_discount_rounds_up_to_a_whole_shekel_and_never_above_the_price(decimal price, decimal percent, decimal expected) =>
        Assert.Equal(expected, PriceBook.Discounted(price, percent));

    [Theory]
    [InlineData(DiscountRules.General, 90)]
    [InlineData(DiscountRules.Dish, 80)]
    [InlineData(DiscountRules.Higher, 80)]
    [InlineData(DiscountRules.Lower, 90)]
    public void The_rule_picks_between_the_dishs_own_discount_and_the_general_one(string rule, decimal expected) =>
        Assert.Equal(expected, PriceBook.ListPrice(100, 80, 10, rule));

    [Theory]
    [InlineData(DiscountRules.General)]
    [InlineData(DiscountRules.Dish)]
    [InlineData(DiscountRules.Higher)]
    [InlineData(DiscountRules.Lower)]
    public void A_dish_without_its_own_discount_gets_the_general_one_whatever_the_rule(string rule)
    {
        Assert.Equal(90, PriceBook.ListPrice(100, 100, 10, rule));
        Assert.Equal(90, PriceBook.ListPrice(100, null, 10, rule));
    }

    [Fact]
    public void Without_a_general_discount_the_list_price_stands()
    {
        Assert.Equal(80, PriceBook.ListPrice(100, 80, null, DiscountRules.General));
        Assert.Null(PriceBook.ListPrice(100, null, null, DiscountRules.General));
    }
}
