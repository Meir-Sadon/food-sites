using FoodSite.Api.Auth;
using FoodSite.Api.Images;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FoodSite.Api.Controllers.Admin;

/// <summary>
/// Base for admin endpoints. Errors use short codes (e.g. "required") that the admin
/// screens translate, so no server text needs translating.
/// </summary>
[ApiController]
[Authorize(Roles = AdminTokenService.AdminRole)]
public abstract class AdminControllerBase : ControllerBase
{
    protected ActionResult Invalid(Errors errors) =>
        ValidationProblem(new ValidationProblemDetails(errors.ToDictionary()));

    protected ActionResult Invalid(string field, string code) => Invalid(new Errors().Add(field, code));

    protected ActionResult Conflict(string code) => Conflict(new { code });

    protected ActionResult ImageStoreUnavailable(ImageStoreUnavailableException e) => ImageStoreError(this, e);

    /// <summary>503 when no image store is configured, 502 when the store turned the upload down.</summary>
    public static ActionResult ImageStoreError(ControllerBase controller, ImageStoreUnavailableException e) =>
        controller.StatusCode(
            e.Code == ImageStoreUnavailableException.UploadFailed ? StatusCodes.Status502BadGateway : StatusCodes.Status503ServiceUnavailable,
            new { code = e.Code });
}

/// <summary>Collects validation error codes per field.</summary>
public class Errors
{
    private readonly Dictionary<string, List<string>> _errors = [];

    public bool Any => _errors.Count > 0;

    public Errors Add(string field, string code)
    {
        if (!_errors.TryGetValue(field, out var codes))
            _errors[field] = codes = [];
        codes.Add(code);
        return this;
    }

    public void Text(string field, string? value, int maxLength, bool required = false)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            if (required) Add(field, "required");
        }
        else if (value.Trim().Length > maxLength)
        {
            Add(field, "tooLong");
        }
    }

    public Dictionary<string, string[]> ToDictionary() => _errors.ToDictionary(e => e.Key, e => e.Value.ToArray());
}

public enum MoveDirection
{
    Up,
    Down,
}

public record MoveRequest(MoveDirection Direction);

public static class Ordering
{
    /// <summary>Swaps an item with its neighbour and renumbers the list 0..n-1. Returns false at either end.</summary>
    public static bool Move<T>(List<T> ordered, T item, MoveDirection direction, Action<T, int> setOrder)
    {
        var index = ordered.IndexOf(item);
        var target = direction == MoveDirection.Up ? index - 1 : index + 1;
        if (index < 0 || target < 0 || target >= ordered.Count)
            return false;

        (ordered[index], ordered[target]) = (ordered[target], ordered[index]);
        Renumber(ordered, setOrder);
        return true;
    }

    public static void Renumber<T>(List<T> ordered, Action<T, int> setOrder)
    {
        for (var i = 0; i < ordered.Count; i++)
            setOrder(ordered[i], i);
    }

    /// <summary>Whether a reorder request lists exactly the current items, each once.</summary>
    public static bool SameIds(IEnumerable<int> current, IReadOnlyCollection<int>? requested) =>
        requested is not null && requested.Distinct().Count() == requested.Count && current.Order().SequenceEqual(requested.Order());

    public static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
