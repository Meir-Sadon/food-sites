using FoodSite.Api.Orders;

namespace FoodSite.Api.Tests;

public class ServiceAreaTests
{
    [Fact]
    public void Cities_are_split_on_commas_trimmed_and_deduplicated()
    {
        Assert.Equal(["אשקלון", "אשדוד"], ServiceArea.Parse(" אשקלון ,, אשדוד,אשקלון "));
        Assert.Empty(ServiceArea.Parse(null));
        Assert.Equal("אשקלון, אשדוד", ServiceArea.Format(ServiceArea.Parse("אשקלון,אשדוד")));
    }

    [Fact]
    public void Only_listed_cities_are_served_unless_the_list_is_empty()
    {
        var cities = ServiceArea.Parse("אשקלון, אשדוד");
        Assert.True(ServiceArea.Serves(cities, " אשדוד "));
        Assert.False(ServiceArea.Serves(cities, "חיפה"));
        Assert.False(ServiceArea.Serves(cities, null));
        Assert.True(ServiceArea.Serves([], "חיפה"));
    }

    [Theory]
    [InlineData("אשקלון", "אשקלון")]
    [InlineData("אשקלון, אשדוד", "אשקלון ואשדוד")]
    [InlineData("אשקלון, אשדוד, שדרות", "אשקלון, אשדוד ושדרות")]
    public void The_list_reads_as_a_hebrew_sentence(string stored, string expected) =>
        Assert.Equal(expected, ServiceArea.Describe(ServiceArea.Parse(stored)));
}
