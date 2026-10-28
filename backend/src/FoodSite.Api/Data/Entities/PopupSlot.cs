namespace FoodSite.Api.Data.Entities;

/// <summary>
/// One of the entry pop-ups the admin can set up (see <c>Popup/EntryPopup</c>): its look, when it opens and the
/// conditions a visitor must all meet to be shown it. A row exists once its slot was saved; an empty slot has none.
/// </summary>
public class PopupSlot
{
    /// <summary>The slots are 1 to <c>EntryPopup.MaxPopups</c>; each holds at most one pop-up.</summary>
    public int Slot { get; set; }

    public bool Enabled { get; set; }

    /// <summary>small, medium or large; null means medium.</summary>
    public string? Size { get; set; }

    /// <summary>always (every page load) or session (once per browser tab); null means always.</summary>
    public string? Frequency { get; set; }

    /// <summary>load (when the page has loaded) or exit (when the visitor seems about to leave); null means load.</summary>
    public string? Trigger { get; set; }

    /// <summary>Seconds to wait before opening it, or before watching for an exit; null means none.</summary>
    public int? DelaySeconds { get; set; }

    public string? Title { get; set; }
    public string? Body { get; set; }
    public string? ImageUrl { get; set; }
    public string? ImagePublicId { get; set; }
    public string? ButtonText { get; set; }
    public string? ButtonUrl { get; set; }

    /// <summary>Only for loggedIn, loggedOut or both visitors; null means the condition is off.</summary>
    public string? Login { get; set; }

    /// <summary>Only for active, inactive or both clients (see <c>Settings.InactiveAfterAmount</c>); null means the condition is off.</summary>
    public string? Activity { get; set; }

    /// <summary>Only once an order was restored (draft), or opened from the last or a favorite order (or any of them); null means off.</summary>
    public string? OrderSource { get; set; }

    /// <summary>Only while the visitor has an order in progress whose total is within <see cref="MinTotal"/> and <see cref="MaxTotal"/>.</summary>
    public bool OrderTotal { get; set; }

    /// <summary>The order total (₪) must be above this; null means no lower limit.</summary>
    public decimal? MinTotal { get; set; }

    /// <summary>The order total (₪) must be below this; null means no upper limit.</summary>
    public decimal? MaxTotal { get; set; }
}
