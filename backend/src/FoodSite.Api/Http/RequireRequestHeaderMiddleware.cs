namespace FoodSite.Api.Http;

/// <summary>
/// Rejects state-changing API requests that lack the <see cref="HeaderName"/> header.
/// Browsers only send a custom header cross-site after a CORS preflight the API does not
/// grant, so forms and scripts on other sites cannot act with the admin's session cookie.
/// </summary>
public class RequireRequestHeaderMiddleware(RequestDelegate next)
{
    public const string HeaderName = "X-Food-Site-Request";

    public Task InvokeAsync(HttpContext context)
    {
        var request = context.Request;
        var safe = HttpMethods.IsGet(request.Method) || HttpMethods.IsHead(request.Method) || HttpMethods.IsOptions(request.Method);
        if (safe || !request.Path.StartsWithSegments("/api") || request.Headers.ContainsKey(HeaderName))
            return next(context);

        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        return context.Response.WriteAsJsonAsync(new { code = "missingRequestHeader" });
    }
}
