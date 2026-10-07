using CloudinaryDotNet;
using CloudinaryDotNet.Actions;

namespace FoodSite.Api.Images;

public class CloudinaryImageStore(Cloudinary cloudinary, ILogger<CloudinaryImageStore> logger) : IImageStore
{
    /// <summary>Longest side kept on upload. Cloudinary serves smaller sizes on request.</summary>
    private const int MaxSide = 1600;

    public async Task<StoredImage> UploadAsync(Stream content, string fileName, string folder, CancellationToken ct = default)
    {
        var result = await cloudinary.UploadAsync(new ImageUploadParams
        {
            File = new FileDescription(fileName, content),
            Folder = folder,
            Transformation = new Transformation().Width(MaxSide).Height(MaxSide).Crop("limit"),
        }, ct);

        if (result.Error is not null || result.SecureUrl is null)
            throw new ImageStoreUnavailableException($"Cloudinary upload failed: {result.Error?.Message}");

        return new StoredImage(result.SecureUrl.ToString(), result.PublicId);
    }

    public async Task DeleteAsync(string publicId, CancellationToken ct = default)
    {
        // A picture left behind in Cloudinary costs nothing on the site, so a failure is only logged.
        var result = await cloudinary.DestroyAsync(new DeletionParams(publicId));
        if (result.Error is not null)
            logger.LogWarning("Could not delete picture {PublicId} from Cloudinary: {Error}", publicId, result.Error.Message);
    }
}
