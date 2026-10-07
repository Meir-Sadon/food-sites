namespace FoodSite.Api.Images;

public record StoredImage(string Url, string PublicId);

/// <summary>Where uploaded pictures live. Production uses Cloudinary.</summary>
public interface IImageStore
{
    Task<StoredImage> UploadAsync(Stream content, string fileName, string folder, CancellationToken ct = default);

    Task DeleteAsync(string publicId, CancellationToken ct = default);
}

/// <summary>Thrown when no image store is configured or it cannot be reached.</summary>
public class ImageStoreUnavailableException(string message, Exception? inner = null) : Exception(message, inner);

/// <summary>Used when Cloudinary__Url is not set: every upload fails with a clear message.</summary>
public class NotConfiguredImageStore : IImageStore
{
    public Task<StoredImage> UploadAsync(Stream content, string fileName, string folder, CancellationToken ct = default) =>
        throw new ImageStoreUnavailableException("Picture uploads are not configured. Set Cloudinary__Url.");

    public Task DeleteAsync(string publicId, CancellationToken ct = default) => Task.CompletedTask;
}
