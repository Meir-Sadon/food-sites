using FoodSite.Api.Data.Entities;

namespace FoodSite.Api.Sites;

/// <summary>
/// The small marks the order page puts on a dish: "on sale" (ticked per dish by the admin), "new" (a dish created within
/// the period the admin picked) and "almost out" (what is left of a limited dish fell to the admin's percent or units).
/// The two settings are saved in <c>Settings.BadgeNew*</c> and <c>Settings.BadgeLowStock*</c>; both start off.
/// </summary>
public static class ItemBadges
{
    public const string Day = "day";
    public const string Week = "week";
    public const string Month = "month";
    public static readonly IReadOnlyList<string> Units = [Day, Week, Month];

    public const string Percent = "percent";
    public const string Pieces = "units";
    public static readonly IReadOnlyList<string> Modes = [Percent, Pieces];

    public const int DefaultNewAmount = 1;
    public const string DefaultNewUnit = Week;
    public const int MaxNewAmount = 365;
    public const string DefaultLowStockMode = Percent;
    public const int DefaultLowStockPercent = 20;
    public const int MaxLowStockPercent = 99;
    public const int MaxLowStockUnits = 100_000;

    /// <summary>The settings as the client site and the admin see them, with defaults filled in.</summary>
    public record Effective(bool NewEnabled, int NewAmount, string NewUnit, bool LowStockEnabled, string LowStockMode, int LowStockAmount);

    public record Input(bool? NewEnabled, int? NewAmount, string? NewUnit, bool? LowStockEnabled, string? LowStockMode, int? LowStockAmount);

    public static Effective Of(Settings s) => new(
        s.BadgeNewEnabled,
        s.BadgeNewAmount is > 0 ? s.BadgeNewAmount.Value : DefaultNewAmount,
        s.BadgeNewUnit is not null && Units.Contains(s.BadgeNewUnit) ? s.BadgeNewUnit : DefaultNewUnit,
        s.BadgeLowStockEnabled,
        s.BadgeLowStockMode is not null && Modes.Contains(s.BadgeLowStockMode) ? s.BadgeLowStockMode : DefaultLowStockMode,
        s.BadgeLowStockAmount is > 0 ? s.BadgeLowStockAmount.Value : DefaultLowStockPercent);

    /// <summary>Whether a dish created at <paramref name="createdAt"/> still counts as new at <paramref name="now"/>.</summary>
    public static bool IsNew(Effective badges, DateTimeOffset createdAt, DateTimeOffset now)
    {
        if (!badges.NewEnabled)
            return false;
        var since = badges.NewUnit switch
        {
            Day => now.AddDays(-badges.NewAmount),
            Month => now.AddMonths(-badges.NewAmount),
            _ => now.AddDays(-7 * badges.NewAmount),
        };
        return createdAt >= since;
    }

    /// <summary>The amount allowed in a mode: 1-99 percent, or a whole number of units.</summary>
    public static bool LowStockAmountValid(string mode, int amount) =>
        amount >= 1 && amount <= (mode == Percent ? MaxLowStockPercent : MaxLowStockUnits);
}
