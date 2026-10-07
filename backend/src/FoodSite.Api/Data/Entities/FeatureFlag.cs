namespace FoodSite.Api.Data.Entities;

/// <summary>Turns one of the site's features on or off, overriding its <c>site.json</c>. Written by the console (ops API).</summary>
public class FeatureFlag
{
    /// <summary>A name from <see cref="Sites.Features"/>.</summary>
    public required string Name { get; set; }
    public bool IsEnabled { get; set; }
}
