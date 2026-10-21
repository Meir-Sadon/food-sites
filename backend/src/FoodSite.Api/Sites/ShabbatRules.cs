using System.Text.Json;

namespace FoodSite.Api.Sites;

/// <summary>
/// How the working hours change around Shabbat and holidays (stored as JSON in <c>Settings.ShabbatRules</c>; null means no change).
/// Each of the two kinds has a rule for its eve (when activity ends) and one for the day it ends (when activity starts again).
/// </summary>
public static class ShabbatRules
{
    public const string None = "none";
    public const string Closed = "closed";
    public const string Fixed = "fixed";
    public const string Before = "before";
    public const string After = "after";

    public static readonly string[] EveModes = [None, Closed, Fixed, Before];
    public static readonly string[] StartModes = [None, Closed, Fixed, After];

    public const decimal MaxHours = 12;

    /// <summary>One side of a rule. <see cref="Time"/> ("HH:mm") for <c>fixed</c>; <see cref="Hours"/> (whole or half) for <c>before</c> / <c>after</c>.</summary>
    public record Side(string Mode = None, string? Time = null, decimal Hours = 0);

    public record Kind(Side Eve, Side Start);

    public record Rules(string? City, Kind Shabbat, Kind Holiday);

    public static Rules Empty => new(null, new(new(), new()), new(new(), new()));

    /// <summary>A city whose sunset decides candle lighting and the end of Shabbat.</summary>
    public record City(string Id, string Name, double Latitude, double Longitude, int CandleMinutes = 18);

    public static readonly IReadOnlyList<City> Cities =
    [
        new("jerusalem", "ירושלים", 31.778, 35.235, 40),
        new("tel-aviv", "תל אביב-יפו", 32.0853, 34.7818),
        new("haifa", "חיפה", 32.794, 34.9896, 30),
        new("beer-sheva", "באר שבע", 31.253, 34.7915),
        new("netanya", "נתניה", 32.3215, 34.8532),
        new("ashdod", "אשדוד", 31.8044, 34.6553),
        new("ashkelon", "אשקלון", 31.6688, 34.5743),
        new("rishon-lezion", "ראשון לציון", 31.973, 34.7925),
        new("petah-tikva", "פתח תקווה", 32.0841, 34.8878),
        new("rehovot", "רחובות", 31.8928, 34.8113),
        new("gedera", "גדרה", 31.8119, 34.7775),
        new("yavne", "יבנה", 31.8781, 34.7394),
        new("nes-ziona", "נס ציונה", 31.93, 34.7983),
        new("modiin", "מודיעין-מכבים-רעות", 31.8969, 35.0104),
        new("lod", "לוד", 31.9467, 34.8903),
        new("ramla", "רמלה", 31.9292, 34.8667),
        new("beit-shemesh", "בית שמש", 31.7469, 34.9881),
        new("bnei-brak", "בני ברק", 32.0807, 34.8338),
        new("ramat-gan", "רמת גן", 32.0684, 34.8248),
        new("holon", "חולון", 32.0158, 34.7874),
        new("bat-yam", "בת ים", 32.0231, 34.7503),
        new("rosh-haayin", "ראש העין", 32.0956, 34.9566),
        new("herzliya", "הרצליה", 32.1624, 34.8447),
        new("kfar-saba", "כפר סבא", 32.175, 34.9066),
        new("raanana", "רעננה", 32.1848, 34.8713),
        new("hadera", "חדרה", 32.434, 34.9196),
        new("afula", "עפולה", 32.6078, 35.2897),
        new("tiberias", "טבריה", 32.7959, 35.5312),
        new("safed", "צפת", 32.9646, 35.496),
        new("karmiel", "כרמיאל", 32.9187, 35.2958),
        new("kiryat-shmona", "קריית שמונה", 33.2073, 35.5693),
        new("kiryat-gat", "קריית גת", 31.61, 34.7642),
        new("sderot", "שדרות", 31.5254, 34.5967),
        new("netivot", "נתיבות", 31.4197, 34.5882),
        new("ofakim", "אופקים", 31.3141, 34.6203),
        new("dimona", "דימונה", 31.0679, 35.0332),
        new("eilat", "אילת", 29.5577, 34.9519),
    ];

    public static City? FindCity(string? id) => Cities.FirstOrDefault(c => c.Id == id);

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static Rules Read(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return Empty;
        try { return JsonSerializer.Deserialize<Rules>(json, Json) is { } r ? Clean(r) : Empty; }
        catch (JsonException) { return Empty; }
    }

    public static string Write(Rules rules) => JsonSerializer.Serialize(rules, Json);

    /// <summary>Fills what a stored or posted value left out, so the rest of the code never meets a null.</summary>
    public static Rules Clean(Rules r) => new(
        string.IsNullOrWhiteSpace(r.City) ? null : r.City,
        CleanKind(r.Shabbat), CleanKind(r.Holiday));

    private static Kind CleanKind(Kind? k) => new(k?.Eve ?? new(), k?.Start ?? new());

    /// <summary>Time "HH:mm" parsed, or null.</summary>
    public static TimeSpan? ParseTime(string? time) =>
        TimeOnly.TryParseExact(time, "HH:mm", out var t) ? t.ToTimeSpan() : null;

    /// <summary>Error codes by field path (<c>shabbat.eve.hours</c>…); empty when the rules can be saved.</summary>
    public static IEnumerable<(string Field, string Code)> Validate(Rules r)
    {
        if (r.City is not null && FindCity(r.City) is null)
            yield return ("city", "invalid");
        var needsCity = false;
        foreach (var (name, kind) in new[] { ("shabbat", r.Shabbat), ("holiday", r.Holiday) })
        {
            foreach (var (side, modes, field) in new[] { (kind.Eve, EveModes, "eve"), (kind.Start, StartModes, "start") })
            {
                var path = $"{name}.{field}";
                if (!modes.Contains(side.Mode))
                {
                    yield return ($"{path}.mode", "invalid");
                    continue;
                }
                if (side.Mode == Fixed && ParseTime(side.Time) is null)
                    yield return ($"{path}.time", "required");
                if (side.Mode is Before or After)
                {
                    needsCity = true;
                    if (side.Hours is < 0 or > MaxHours || side.Hours * 2 != decimal.Truncate(side.Hours * 2))
                        yield return ($"{path}.hours", "invalid");
                }
            }
        }
        if (needsCity && r.City is null)
            yield return ("city", "required");
    }
}
