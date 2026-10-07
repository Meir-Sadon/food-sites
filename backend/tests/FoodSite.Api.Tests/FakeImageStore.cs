using FoodSite.Api.Images;

namespace FoodSite.Api.Tests;

public sealed class FakeImageStore : IImageStore
{
    private int _next;

    public List<(string Folder, string FileName)> Uploads { get; } = [];
    public List<string> Deleted { get; } = [];
    public bool Unavailable { get; set; }

    public Task<StoredImage> UploadAsync(Stream content, string fileName, string folder, CancellationToken ct = default)
    {
        if (Unavailable)
            throw new ImageStoreUnavailableException("test");
        Uploads.Add((folder, fileName));
        var id = $"{folder}/img{Interlocked.Increment(ref _next)}";
        return Task.FromResult(new StoredImage($"https://images.test/{id}.jpg", id));
    }

    public Task DeleteAsync(string publicId, CancellationToken ct = default)
    {
        Deleted.Add(publicId);
        return Task.CompletedTask;
    }
}
