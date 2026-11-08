namespace FoodSite.Api.Data.Entities;

/// <summary>A phone that gets a WhatsApp message for every new order, and a Pushover alert when it has a user key.</summary>
public class NotifyPhone
{
    public int Id { get; set; }
    public required string Phone { get; set; }
    public string? Name { get; set; }

    /// <summary>The person's Pushover user key (30 letters and digits). Empty means no phone alert.</summary>
    public string? PushoverKey { get; set; }

    /// <summary>A Pushover sound name (see <see cref="Push.PushoverSounds"/>); empty means the default alarm.</summary>
    public string? PushoverSound { get; set; }
}
