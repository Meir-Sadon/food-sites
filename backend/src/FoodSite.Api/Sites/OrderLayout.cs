namespace FoodSite.Api.Sites;

/// <summary>
/// How the client's order page is laid out, apart from the look (<see cref="SiteStyles"/>): where the order total sits
/// and whether the menu is one long page or one category at a time. A site's defaults are <c>site.json</c> →
/// <c>settings.orderTotalPosition</c> and <c>settings.orderFlow</c>; the admin's choices in
/// <c>Settings.OrderTotalPosition</c> and <c>Settings.OrderFlow</c> win over them.
/// </summary>
public static class OrderLayout
{
    /// <summary>The total is a bar across the bottom of the screen.</summary>
    public const string TotalBottom = "bottom";

    /// <summary>On a wide screen the total is a panel at the side (left in Hebrew); a narrow screen keeps the bottom bar.</summary>
    public const string TotalSide = "side";

    public static readonly IReadOnlyList<string> TotalPositions = [TotalBottom, TotalSide];

    /// <summary>The whole menu on one page, then the order details.</summary>
    public const string FlowPage = "page";

    /// <summary>One category at a time, paged with arrows, then a last step with the order details.</summary>
    public const string FlowSteps = "steps";

    /// <summary>The whole menu on one page; the order details (address, payment, remarks) appear only after the client presses a continue button.</summary>
    public const string FlowContinue = "continue";

    public static readonly IReadOnlyList<string> Flows = [FlowPage, FlowSteps, FlowContinue];

    public const int MaxLength = 20;

    public static bool IsKnownTotalPosition(string? name) => name is not null && TotalPositions.Contains(name);

    public static bool IsKnownFlow(string? name) => name is not null && Flows.Contains(name);

    /// <summary>The position the site shows: the admin's choice, else the site's default, else <see cref="TotalBottom"/>.</summary>
    public static string EffectiveTotalPosition(string? chosen, string? siteDefault) =>
        IsKnownTotalPosition(chosen) ? chosen! : IsKnownTotalPosition(siteDefault) ? siteDefault! : TotalBottom;

    /// <summary>The flow the site uses: the admin's choice, else the site's default, else <see cref="FlowPage"/>.</summary>
    public static string EffectiveFlow(string? chosen, string? siteDefault) =>
        IsKnownFlow(chosen) ? chosen! : IsKnownFlow(siteDefault) ? siteDefault! : FlowPage;
}
