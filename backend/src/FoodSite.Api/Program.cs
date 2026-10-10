using System.Threading.RateLimiting;
using FoodSite.Api.Auth;
using FoodSite.Api.Controllers;
using FoodSite.Api.Data;
using FoodSite.Api.Http;
using FoodSite.Api.Images;
using FoodSite.Api.Messaging;
using FoodSite.Api.Orders;
using FoodSite.Api.Sites;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

// `dotnet run -- hash-password [password]` prints a hash for Admin__PasswordHash or Admin__MasterPasswordHash.
if (args.Length > 0 && args[0] == "hash-password")
{
    var password = args.Length > 1 ? args[1] : Console.ReadLine();
    if (string.IsNullOrEmpty(password))
    {
        Console.Error.WriteLine("Usage: dotnet run -- hash-password <password>   (or pipe it on stdin)");
        return 1;
    }
    Console.WriteLine(AdminPasswordHasher.Hash(password));
    return 0;
}

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

// The business this deployment serves: sites/<id>/site.json, copied into the image as ./site.
SiteFolder.AddTo(config, builder.Environment.ContentRootPath);
var site = config.GetSection(SiteOptions.Section).Get<SiteOptions>() ?? new SiteOptions();
if (!SiteOptions.IsValidId(site.Id))
    throw new InvalidOperationException(
        "Site:Id must be set (from sites/<id>/site.json via Site:Directory, or Site__Id) "
        + "and use only lowercase letters, digits and dashes.");
if (site.Features.Keys.FirstOrDefault(name => !Features.IsKnown(name)) is { } unknownFeature)
    throw new InvalidOperationException(
        $"Site:Features:{unknownFeature} is not a feature. Known features: {string.Join(", ", Features.All)}.");
if (site.Settings.Style is { } style && !SiteStyles.IsKnown(style))
    throw new InvalidOperationException(
        $"Site:Settings:Style {style} is not a style. Known styles: {string.Join(", ", SiteStyles.All)}.");
builder.Services.Configure<SiteOptions>(config.GetSection(SiteOptions.Section));
builder.Services.AddScoped<FeatureFlags>();
// Cookie names, the JWT issuer and the WhatsApp template names are built from the site id unless configured.
builder.Services.PostConfigure<JwtOptions>(o => o.UseSiteDefaults(site));
builder.Services.PostConfigure<FoodSite.Api.Auth.CookieOptions>(o => o.UseSiteDefaults(site));
builder.Services.PostConfigure<WhatsAppOptions>(o => o.UseSiteDefaults(site));

builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<FoodSite.Api.Audit.AuditActor>();
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(config.GetConnectionString("Default")));

builder.Services.Configure<JwtOptions>(config.GetSection(JwtOptions.Section));
builder.Services.Configure<AdminOptions>(config.GetSection(AdminOptions.Section));
builder.Services.Configure<FoodSite.Api.Auth.CookieOptions>(config.GetSection(FoodSite.Api.Auth.CookieOptions.Section));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.Configure<AccountOptions>(config.GetSection(AccountOptions.Section));
builder.Services.AddSingleton<AdminTokenService>();
builder.Services.AddSingleton<UserTokenService>();
builder.Services.AddSingleton<SiteClock>();
// Messages go out through the WhatsApp Cloud API once WhatsApp__PhoneNumberId and WhatsApp__Token are
// set (after Meta approves the templates); until then they are only written to the log.
builder.Services.Configure<WhatsAppOptions>(config.GetSection(WhatsAppOptions.Section));
if (config.GetSection(WhatsAppOptions.Section).Get<WhatsAppOptions>()?.IsConfigured == true)
    builder.Services.AddHttpClient<IWhatsAppSender, WhatsAppCloudSender>(c => c.Timeout = TimeSpan.FromSeconds(15));
else
    builder.Services.AddSingleton<IWhatsAppSender, SimulatedWhatsAppSender>();

var jwt = config.GetSection(JwtOptions.Section).Get<JwtOptions>() ?? new JwtOptions();
jwt.UseSiteDefaults(site);
if (System.Text.Encoding.UTF8.GetByteCount(jwt.Secret) < 32)
    throw new InvalidOperationException("Jwt:Secret must be set and at least 32 bytes long.");
var cookies = config.GetSection(FoodSite.Api.Auth.CookieOptions.Section).Get<FoodSite.Api.Auth.CookieOptions>()
    ?? new FoodSite.Api.Auth.CookieOptions();
cookies.UseSiteDefaults(site);
var cookieName = cookies.Name;
var adminOptions = config.GetSection(AdminOptions.Section).Get<AdminOptions>() ?? new AdminOptions();
if (string.IsNullOrWhiteSpace(adminOptions.OwnerUsername) || string.IsNullOrWhiteSpace(adminOptions.MasterUsername)
    || string.Equals(adminOptions.OwnerUsername.Trim(), adminOptions.MasterUsername.Trim(), StringComparison.OrdinalIgnoreCase))
    throw new InvalidOperationException("Admin:OwnerUsername and Admin:MasterUsername must be set and different.");
var userCookieName = cookies.UserName;

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidIssuer = jwt.Issuer,
            ValidAudience = jwt.Issuer,
            IssuerSigningKey = AdminTokenService.SigningKey(jwt.Secret),
            RoleClaimType = System.Security.Claims.ClaimTypes.Role,
            ClockSkew = TimeSpan.FromMinutes(1),
        };
        // The token lives in an httpOnly cookie rather than the Authorization header.
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                context.Token = context.Request.Cookies[cookieName];
                return Task.CompletedTask;
            },
            // Every change is audited by who made it, so a session that does not say which admin it is
            // (one from before there were two) has to log in again.
            OnTokenValidated = context =>
            {
                if (!AdminActor.IsKnown(context.Principal?.FindFirst(AdminTokenService.ActorClaim)?.Value))
                    context.Fail("The admin session does not name its admin.");
                return Task.CompletedTask;
            },
        };
    })
    // A logged-in client: its own cookie and audience, so it never works as an admin session.
    .AddJwtBearer(UserTokenService.Scheme, options =>
    {
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidIssuer = jwt.Issuer,
            ValidAudience = UserTokenService.Audience(jwt.Issuer),
            IssuerSigningKey = AdminTokenService.SigningKey(jwt.Secret),
            ClockSkew = TimeSpan.FromMinutes(1),
        };
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                context.Token = context.Request.Cookies[userCookieName];
                return Task.CompletedTask;
            },
        };
    });
builder.Services.AddAuthorization();

var loginLimit = adminOptions.LoginAttemptsPerMinute;
var publicLimit = config.GetValue<int?>("Public:RequestsPerMinute") ?? 30;
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    // Phone codes and orders: per IP, to block abuse and keep message costs down.
    options.AddPolicy(PublicControllerBase.WriteRateLimitPolicy, context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = publicLimit,
                Window = TimeSpan.FromMinutes(1),
            }));
    options.AddPolicy(AdminAuthController.LoginRateLimitPolicy, context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = loginLimit,
                Window = TimeSpan.FromMinutes(1),
            }));
});

// Behind a reverse proxy (nginx in docker-compose, or the host's load balancer),
// take the client address from the one proxy in front of us.
if (config.GetValue<bool>("ForwardedHeaders:Enabled"))
{
    builder.Services.Configure<ForwardedHeadersOptions>(options =>
    {
        options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
        options.ForwardLimit = 1;
        options.KnownIPNetworks.Clear();
        options.KnownProxies.Clear();
    });
}

// Pictures go to Cloudinary when Cloudinary__Url is set; otherwise uploads answer 503.
var cloudinaryUrl = config["Cloudinary:Url"];
if (string.IsNullOrWhiteSpace(cloudinaryUrl))
{
    builder.Services.AddSingleton<IImageStore, NotConfiguredImageStore>();
}
else
{
    builder.Services.AddSingleton(new CloudinaryDotNet.Cloudinary(cloudinaryUrl) { Api = { Secure = true } });
    builder.Services.AddSingleton<IImageStore, CloudinaryImageStore>();
}

builder.Services.AddControllers()
    .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter()));

var app = builder.Build();

if (config.GetValue<bool>("ForwardedHeaders:Enabled"))
    app.UseForwardedHeaders();

app.UseMiddleware<RequireRequestHeaderMiddleware>();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

// commit lets the deploy workflow tell when the canary runs a new build (Render sets RENDER_GIT_COMMIT).
app.MapGet("/api/health", () => Results.Ok(new { status = "ok", commit = Environment.GetEnvironmentVariable("RENDER_GIT_COMMIT") }));
app.MapControllers();

// The production image (Dockerfile at the repo root) puts the built frontend in wwwroot,
// so one service serves the site and the API on the same origin.
if (Directory.Exists(app.Environment.WebRootPath))
{
    app.UseDefaultFiles();
    app.UseStaticFiles();
    // Client-side routes (/login, /admin, ...) load the app; files and unknown /api paths stay 404.
    app.MapFallbackToFile("{*path:nonfile:regex(^(?!api(/|$)).*$)}", "index.html");
}

await DatabaseInitializer.InitializeAsync(
    app.Services,
    migrate: config.GetValue<bool>("Database:MigrateOnStartup"),
    applySeeds: config.GetValue("Database:ApplySeeds", true));

app.Run();
return 0;

public partial class Program;
