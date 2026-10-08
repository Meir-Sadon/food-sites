using System.Text.RegularExpressions;

namespace FoodSite.Api.Sites;

/// <summary>
/// The business this deployment serves. Read from <c>sites/&lt;id&gt;/site.json</c> (see <see cref="SiteFolder"/>);
/// any value can still be overridden by an environment variable such as <c>Site__Id</c>.
/// </summary>
public partial class SiteOptions
{
    public const string Section = "Site";

    /// <summary>Lowercase letters, digits and dashes, e.g. "sample-site". Names cookies, image folders and templates.</summary>
    public string Id { get; set; } = "";

    /// <summary>The business's display name (<c>app.name</c> in the site's <c>i18n/he.json</c>), shown in WhatsApp messages.</summary>
    public string? Name { get; set; }

    public string TimeZone { get; set; } = "Asia/Jerusalem";

    /// <summary>The site folder (absolute once loaded). Seed files are resolved against it.</summary>
    public string? Directory { get; set; }

    /// <summary>Template names from <c>site.json</c>; when missing they are built from <see cref="Id"/>.</summary>
    public SiteWhatsAppTemplates WhatsApp { get; set; } = new();

    /// <summary>
    /// The cities deliveries go to, comma-separated. Copied into Settings on startup while Settings has none;
    /// the admin edits them there afterwards.
    /// </summary>
    public string? ServiceCities { get; set; }

    /// <summary>
    /// <c>site.json</c> → <c>settings</c>: the admin settings a new site starts with (main contact, delivery
    /// texts, background). Copied into Settings once, on the first start that has them; the admin edits them there afterwards.
    /// </summary>
    public SiteSettingsDefaults Settings { get; set; } = new();

    /// <summary>
/// Menu seed files, relative to <see cref="Directory"/>, applied on every start without undoing admin changes.
/// <c>../_shared/seed/&lt;name&gt;.json</c> is a seed every site can list (the image copies <c>sites/_shared</c> next to <c>site</c>).
/// </summary>
    public List<string> Seed { get; set; } = [];

    /// <summary>
    /// <c>site.json</c> → <c>features</c>: which of <see cref="Sites.Features"/> the site has by default.
    /// A feature left out is off. <see cref="FeatureFlags"/> applies the database's overrides.
    /// </summary>
    public Dictionary<string, bool> Features { get; set; } = new(StringComparer.OrdinalIgnoreCase);

    public bool IsEnabledByDefault(string feature) => Features.GetValueOrDefault(feature);

    public static bool IsValidId(string? id) => id is not null && IdPattern().IsMatch(id);

    /// <summary>The Cloudinary folder for one kind of picture, so sites sharing an account never mix pictures.</summary>
    public string ImageFolder(string kind) => $"{Id}/{kind}";

    /// <summary>Meta template names allow only lowercase letters, digits and underscores.</summary>
    public string TemplatePrefix => Id.Replace('-', '_');

    [GeneratedRegex("^[a-z0-9]+(-[a-z0-9]+)*$")]
    private static partial Regex IdPattern();
}

/// <summary>Admin settings a site starts with; a value left out stays empty. See <see cref="SiteOptions.Settings"/>.</summary>
public class SiteSettingsDefaults
{
    public string? ContactName { get; set; }
    public string? ContactPhone { get; set; }
    public string? ContactAddress { get; set; }
    public string? ContactEmail { get; set; }
    public string? ContactOpeningHours { get; set; }
    public string? DeliveryAreaText { get; set; }
    public string? DeliveryFeeText { get; set; }
    public string? KashrutText { get; set; }

    /// <summary>An absolute URL, or a path served from the site root (the site's <c>public/</c> folder).</summary>
    public string? BackgroundImageUrl { get; set; }
}

public class SiteWhatsAppTemplates
{
    public string? OrderConfirmationTemplate { get; set; }
    public string? NewOrderTemplate { get; set; }
}
