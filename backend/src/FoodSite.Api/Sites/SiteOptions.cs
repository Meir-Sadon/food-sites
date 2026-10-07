using System.Text.RegularExpressions;

namespace FoodSite.Api.Sites;

/// <summary>
/// The business this deployment serves. Read from <c>sites/&lt;id&gt;/site.json</c> (see <see cref="SiteFolder"/>);
/// any value can still be overridden by an environment variable such as <c>Site__Id</c>.
/// </summary>
public partial class SiteOptions
{
    public const string Section = "Site";

    /// <summary>Lowercase letters, digits and dashes, e.g. "grape-leaves". Names cookies, image folders and templates.</summary>
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

    /// <summary>Menu seed files, relative to <see cref="Directory"/>, applied on every start without undoing admin changes.</summary>
    public List<string> Seed { get; set; } = [];

    public static bool IsValidId(string? id) => id is not null && IdPattern().IsMatch(id);

    /// <summary>The Cloudinary folder for one kind of picture, so sites sharing an account never mix pictures.</summary>
    public string ImageFolder(string kind) => $"{Id}/{kind}";

    /// <summary>Meta template names allow only lowercase letters, digits and underscores.</summary>
    public string TemplatePrefix => Id.Replace('-', '_');

    [GeneratedRegex("^[a-z0-9]+(-[a-z0-9]+)*$")]
    private static partial Regex IdPattern();
}

public class SiteWhatsAppTemplates
{
    public string? OrderConfirmationTemplate { get; set; }
    public string? NewOrderTemplate { get; set; }
}
