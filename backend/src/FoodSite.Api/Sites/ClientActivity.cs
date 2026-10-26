using FoodSite.Api.Data.Entities;

namespace FoodSite.Api.Sites;

/// <summary>
/// What makes a registered client inactive: no order for the period the admin picked (<c>Settings.InactiveAfter*</c>).
/// The client site compares the period with the client's last order, to decide which pop-ups to show.
/// </summary>
public static class ClientActivity
{
    public const string Week = "week";
    public const string Month = "month";
    public static readonly IReadOnlyList<string> Units = [Week, Month];

    public const int DefaultAmount = 3;
    public const string DefaultUnit = Month;
    public const int MaxAmount = 104;

    public record Period(int Amount, string Unit);

    public static Period Of(Settings s) => new(
        s.InactiveAfterAmount is > 0 ? s.InactiveAfterAmount.Value : DefaultAmount,
        s.InactiveAfterUnit is not null && Units.Contains(s.InactiveAfterUnit) ? s.InactiveAfterUnit : DefaultUnit);
}
