using FoodSite.Api.Data.Entities;
using FoodSite.Api.Sites;

namespace FoodSite.Api.Banners;

/// <summary>
/// The order page's top banner and the scroll animation under it: what the admin can set, the limits, and how it is
/// shown to the admin and to clients. Needs the <see cref="Features.BannerAnimation"/> feature.
/// </summary>
public static class OrderBannerRules
{
    public const int TitleMaxLength = 60;
    public const int TaglineMaxLength = 160;
    public const int ChipMaxLength = 30;
    public const int MaxChips = 6;

    /// <summary>The most pictures an animation can have.</summary>
    public const int MaxFrames = 40;

    public const int MinScreens = 2;
    public const int MaxScreens = 10;
    public const int DefaultScreens = 4;

    public record FrameDto(int Id, string Url);

    /// <summary>
    /// The banner as the admin and the client site see it. A missing <c>Title</c>, <c>Tagline</c> or colour means the
    /// standard one, an empty <c>Chips</c> the standard ovals, a null <c>LogoUrl</c> the site's main logo.
    /// </summary>
    public record Dto(
        bool Enabled, string? Title, string? Tagline, IReadOnlyList<string> Chips, string? Background, string? TextColor, string? LogoUrl,
        bool AnimationEnabled, int AnimationScreens, IReadOnlyList<FrameDto> Frames);

    public static IReadOnlyList<string> ParseChips(string? chips) =>
        string.IsNullOrWhiteSpace(chips) ? [] : chips.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    public static int EffectiveScreens(int? screens) => screens is >= MinScreens and <= MaxScreens ? screens.Value : DefaultScreens;

    public static Dto Of(OrderBanner? banner, IEnumerable<BannerFrame> frames) => new(
        banner?.Enabled ?? false, banner?.Title, banner?.Tagline, ParseChips(banner?.Chips), banner?.Background, banner?.TextColor, banner?.LogoUrl,
        banner?.AnimationEnabled ?? false, EffectiveScreens(banner?.AnimationScreens),
        frames.OrderBy(f => f.DisplayOrder).ThenBy(f => f.Id).Select(f => new FrameDto(f.Id, f.ImageUrl)).ToList());

    /// <summary>What a client is sent: null unless the banner or a working animation (two pictures or more) is on.</summary>
    public static Dto? ForClient(OrderBanner? banner, IEnumerable<BannerFrame> frames)
    {
        var dto = Of(banner, frames);
        var animated = dto.AnimationEnabled && dto.Frames.Count >= 2;
        return dto.Enabled || animated ? dto with { AnimationEnabled = animated, Frames = animated ? dto.Frames : [] } : null;
    }
}
