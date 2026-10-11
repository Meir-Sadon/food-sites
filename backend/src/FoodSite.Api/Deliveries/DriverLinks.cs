using System.Buffers.Text;
using System.Security.Cryptography;
using FoodSite.Api.Data.Entities;

namespace FoodSite.Api.Deliveries;

public static class DriverLinks
{
    /// <summary>The link keeps working through this many days after its supply day, for late reports and corrections.</summary>
    public const int DaysAfterSupply = 1;

    /// <summary>192 random bits: the link is the driver's only key, so it must not be guessable.</summary>
    public static string NewToken() => Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(24));

    public static DateOnly ValidThrough(DateOnly supplyDate) => supplyDate.AddDays(DaysAfterSupply);

    /// <summary>Whether a link for this supply day still works on the site's local date.</summary>
    public static bool IsValid(DateOnly supplyDate, DateTime nowLocal) =>
        DateOnly.FromDateTime(nowLocal) <= ValidThrough(supplyDate);

    public static bool LooksLikeToken(string token) => token.Length == DriverRoute.TokenLength;
}
