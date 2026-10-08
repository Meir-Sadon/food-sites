using System.Security.Cryptography;
using FoodSite.Api.Data.Entities;

namespace FoodSite.Api.Reviews;

public static class ReviewTokens
{
    private const string Alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    /// <summary>A short random token for a review link: about 58 bits, so links can't be guessed.</summary>
    public static string New() => RandomNumberGenerator.GetString(Alphabet, Review.TokenLength);

    /// <summary>The name a review starts with: the client's first name from the order.</summary>
    public static string FirstName(string orderName)
    {
        var name = orderName.Trim();
        var space = name.IndexOf(' ');
        var first = space > 0 ? name[..space] : name;
        return first.Length > Review.NameMaxLength ? first[..Review.NameMaxLength] : first;
    }
}
