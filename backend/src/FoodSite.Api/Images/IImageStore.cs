namespace FoodSite.Api.Images;

public record StoredImage(string Url, string PublicId);

/// <summary>Where uploaded pictures live. Production uses Cloudinary.</summary>
public interface IImageStore
{
    Task<StoredImage> UploadAsync(Stream content, string fileName, string folder, CancellationToken ct = default);

    Task DeleteAsync(string publicId, CancellationToken ct = default);
}

/// <summary>
/// Thrown when no image store is configured (<see cref="Code"/> <c>imageStoreUnavailable</c>), or the store turned
/// an upload down (<c>imageUploadFailed</c>, e.g. a wrong Cloudinary key): the code is what the client is told.
/// </summary>
public class ImageStoreUnavailableException(string message, string code = ImageStoreUnavailableException.NotConfigured, Exception? inner = null)
    : Exception(message, inner)
{
    public const string NotConfigured = "imageStoreUnavailable";
    public const string UploadFailed = "imageUploadFailed";

    public string Code { get; } = code;
}

/// <summary>Used when Cloudinary__Url is not set: every upload fails with a clear message.</summary>
public class NotConfiguredImageStore : IImageStore
{
    public Task<StoredImage> UploadAsync(Stream content, string fileName, string folder, CancellationToken ct = default) =>
        throw new ImageStoreUnavailableException("Picture uploads are not configured. Set Cloudinary__Url.");

    public Task DeleteAsync(string publicId, CancellationToken ct = default) => Task.CompletedTask;
}
