using System.Text.RegularExpressions;

namespace FoodSite.Api.Mail;

/// <summary>The owner's mail setting holds one address or several separated by commas (or semicolons).</summary>
public static partial class OwnerRecipients
{
    public static IReadOnlyList<string> Split(string? value) =>
        (value ?? "").Split([',', ';', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Distinct(StringComparer.OrdinalIgnoreCase).ToList();

    /// <summary>Empty is valid (no mail); otherwise every address must look like one and the whole text must fit.</summary>
    public static bool IsValid(string? value, int maxLength) =>
        (value ?? "").Length <= maxLength && Split(value).All(a => EmailPattern().IsMatch(a));

    /// <summary>The addresses written the same way every time: trimmed, without duplicates, joined by ", ".</summary>
    public static string Normalize(string? value) => string.Join(", ", Split(value));

    [GeneratedRegex(@"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
    private static partial Regex EmailPattern();
}
