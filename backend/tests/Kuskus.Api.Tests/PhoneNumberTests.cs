using Kuskus.Api.Phones;

namespace Kuskus.Api.Tests;

public class PhoneNumberTests
{
    [Theory]
    [InlineData("0501234567", "0501234567")]
    [InlineData("050-123 4567", "0501234567")]
    [InlineData("+972 50 123 4567", "0501234567")]
    [InlineData("972501234567", "0501234567")]
    [InlineData("(04) 8123456", "048123456")]
    public void Valid_numbers_are_normalized(string input, string expected) =>
        Assert.Equal(expected, PhoneNumber.Normalize(input));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("12345")]
    [InlineData("050-12a4567")]
    [InlineData("1501234567")]
    [InlineData("05012345678901")]
    public void Invalid_numbers_are_rejected(string? input) => Assert.Null(PhoneNumber.Normalize(input));

    [Fact]
    public void International_form_drops_the_leading_zero() =>
        Assert.Equal("972501234567", PhoneNumber.ToInternational("0501234567"));
}
