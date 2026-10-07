namespace FoodSite.Api.Phones;

public static class PhoneNumber
{
    /// <summary>
    /// Turns an Israeli phone number typed in any common way ("050-123 4567", "+972501234567")
    /// into its local form "0501234567". Returns null when it is not a plausible number.
    /// </summary>
    public static string? Normalize(string? input)
    {
        if (string.IsNullOrWhiteSpace(input))
            return null;

        var digits = new System.Text.StringBuilder();
        var text = input.Trim();
        for (var i = 0; i < text.Length; i++)
        {
            var c = text[i];
            if (char.IsAsciiDigit(c)) digits.Append(c);
            else if (c == '+' && i == 0) continue;
            else if (c is ' ' or '-' or '(' or ')') continue;
            else return null;
        }

        var number = digits.ToString();
        if (number.StartsWith("972"))
            number = "0" + number[3..];

        // 0 + area or mobile prefix + 7 digits: 9 or 10 digits in all.
        if (number.Length is < 9 or > 10 || number[0] != '0' || number[1] == '0')
            return null;
        return number;
    }

    /// <summary>"0501234567" as "972501234567", the form the WhatsApp API wants.</summary>
    public static string ToInternational(string normalized) => "972" + normalized[1..];
}
