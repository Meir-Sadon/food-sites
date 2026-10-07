using FoodSite.Api.Auth;
using FoodSite.Api.Data;
using FoodSite.Api.Messaging;
using FoodSite.Api.Sites;
using Microsoft.Extensions.Configuration;

namespace FoodSite.Api.Tests;

public sealed class SiteFolderTests : IDisposable
{
    private readonly string _directory = Directory.CreateTempSubdirectory("site-").FullName;

    public void Dispose() => Directory.Delete(_directory, recursive: true);

    /// <summary>The repository root, found from the test binaries' folder.</summary>
    public static string RepoRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !Directory.Exists(Path.Combine(directory.FullName, "sites")))
            directory = directory.Parent;
        return directory?.FullName ?? throw new DirectoryNotFoundException("No sites/ folder above the test binaries.");
    }

    private void Write(string path, string content)
    {
        var full = Path.Combine(_directory, path);
        Directory.CreateDirectory(Path.GetDirectoryName(full)!);
        File.WriteAllText(full, content);
    }

    /// <summary>Configuration as the app builds it: appsettings.json, then environment variables.</summary>
    private static ConfigurationManager Configuration(Dictionary<string, string?> environment)
    {
        var config = new ConfigurationManager();
        config.AddJsonFile("appsettings.json", optional: true);
        config.AddInMemoryCollection(environment);
        return config;
    }

    [Fact]
    public void Site_json_and_the_site_name_are_loaded_under_Site()
    {
        Write("site.json", """{ "id": "sample-site", "timeZone": "Europe/London", "seed": ["seed/menu.json"] }""");
        Write("i18n/he.json", """{ "app": { "name": "עלי גפן" } }""");
        var config = Configuration(new() { ["Site:Directory"] = _directory });

        SiteFolder.AddTo(config, "/");

        var site = config.GetSection(SiteOptions.Section).Get<SiteOptions>()!;
        Assert.Equal("sample-site", site.Id);
        Assert.Equal("עלי גפן", site.Name);
        Assert.Equal("Europe/London", site.TimeZone);
        Assert.Equal(["seed/menu.json"], site.Seed);
    }

    [Fact]
    public void Environment_variables_still_win_over_site_json()
    {
        Write("site.json", """{ "id": "sample-site", "timeZone": "Europe/London" }""");
        var config = Configuration(new() { ["Site:Directory"] = _directory, ["Site:TimeZone"] = "Asia/Jerusalem" });

        SiteFolder.AddTo(config, "/");

        Assert.Equal("Asia/Jerusalem", config["Site:TimeZone"]);
        Assert.Equal("sample-site", config["Site:Id"]);
    }

    [Fact]
    public void A_folder_without_site_json_stops_the_app()
    {
        var config = Configuration(new() { ["Site:Directory"] = _directory });
        Assert.Throws<InvalidOperationException>(() => SiteFolder.AddTo(config, "/"));
    }

    [Fact]
    public void Cookies_issuer_and_templates_are_built_from_the_site_id_unless_configured()
    {
        var site = new SiteOptions { Id = "sample-site", WhatsApp = { NewOrderTemplate = "sample_alert" } };

        var cookies = new Auth.CookieOptions { UserName = "custom_user" };
        cookies.UseSiteDefaults(site);
        var jwt = new JwtOptions();
        jwt.UseSiteDefaults(site);
        var whatsApp = new WhatsAppOptions();
        whatsApp.UseSiteDefaults(site);

        Assert.Equal("sample-site_admin", cookies.Name);
        Assert.Equal("custom_user", cookies.UserName);
        Assert.Equal("sample-site", jwt.Issuer);
        Assert.Equal("sample_site_order_confirmation", whatsApp.OrderConfirmationTemplate);
        Assert.Equal("sample_alert", whatsApp.NewOrderTemplate);
    }

    [Fact]
    public void Every_seed_file_a_site_lists_loads()
    {
        var sites = Path.Combine(RepoRoot(), "sites");
        foreach (var siteJson in Directory.GetFiles(sites, "site.json", SearchOption.AllDirectories))
        {
            var site = new ConfigurationBuilder().AddJsonFile(siteJson).Build().Get<SiteOptions>()!;
            foreach (var file in site.Seed)
                Assert.NotEmpty(MenuSeed.Load(Path.Combine(Path.GetDirectoryName(siteJson)!, file)).Categories);
        }
    }

    [Fact]
    public void Every_feature_a_site_lists_is_known()
    {
        var sites = Path.Combine(RepoRoot(), "sites");
        foreach (var siteJson in Directory.GetFiles(sites, "site.json", SearchOption.AllDirectories))
        {
            var site = new ConfigurationBuilder().AddJsonFile(siteJson).Build().Get<SiteOptions>()!;
            Assert.All(site.Features.Keys, name => Assert.True(Features.IsKnown(name), $"{siteJson}: unknown feature {name}"));
        }
    }

    [Theory]
    [InlineData("kitchen", true)]
    [InlineData("sample-site", true)]
    [InlineData("", false)]
    [InlineData("Grape", false)]
    [InlineData("-sample", false)]
    [InlineData("sample_site", false)]
    public void Site_ids_are_lowercase_words_joined_by_dashes(string id, bool valid) =>
        Assert.Equal(valid, SiteOptions.IsValidId(id));
}
