namespace FoodSite.Api.Payments;

/// <summary>
/// The business's own Invoice4U account (<c>Invoice4U__*</c> in the environment, never in the repository).
/// Without a valid <see cref="ApiKey"/> the credit card payment is not offered even when the feature is on.
/// </summary>
public class Invoice4UOptions
{
    public const string Section = "Invoice4U";

    public const string ProductionUrl = "https://api.invoice4u.co.il/Services/ApiService.svc";
    public const string QaUrl = "https://apiqa.invoice4u.co.il/Services/ApiService.svc";

    /// <summary>The organization API key of the business's Invoice4U account (a GUID).</summary>
    public string ApiKey { get; set; } = "";

    /// <summary>Charge against the test (QA) environment: the QA address and <c>IsQaMode</c> on every request.</summary>
    public bool QaMode { get; set; }

    /// <summary>Overrides the service address (tests); empty means the QA or production address.</summary>
    public string BaseUrl { get; set; } = "";

    public bool IsConfigured => Guid.TryParse(ApiKey, out _);

    public string EffectiveBaseUrl => !string.IsNullOrWhiteSpace(BaseUrl) ? BaseUrl.TrimEnd('/') : QaMode ? QaUrl : ProductionUrl;
}
