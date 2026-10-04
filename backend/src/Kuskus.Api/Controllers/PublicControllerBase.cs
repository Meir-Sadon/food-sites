using Kuskus.Api.Controllers.Admin;
using Microsoft.AspNetCore.Mvc;

namespace Kuskus.Api.Controllers;

/// <summary>Base for the client site's endpoints. Errors are short codes the site translates.</summary>
[ApiController]
public abstract class PublicControllerBase : ControllerBase
{
    public const string WriteRateLimitPolicy = "public-write";

    protected ActionResult Invalid(Errors errors) =>
        ValidationProblem(new ValidationProblemDetails(errors.ToDictionary()));

    protected ActionResult Invalid(string field, string code) => Invalid(new Errors().Add(field, code));
}
