namespace Kuskus.Api.Images;

/// <summary>Checks an uploaded picture before it is sent to the image store.</summary>
public static class ImageUploadRules
{
    public const long MaxBytes = 5 * 1024 * 1024;

    /// <summary>
    /// Request limit for upload endpoints. Above MaxBytes so a slightly larger picture gets the
    /// "imageTooLarge" answer instead of a bare framework error. Matches nginx's client_max_body_size.
    /// </summary>
    public const long MaxRequestBytes = 6 * 1024 * 1024;

    /// <summary>Returns an error code, or null when the file is acceptable.</summary>
    public static string? Validate(IFormFile? file)
    {
        if (file is null || file.Length == 0)
            return "imageMissing";
        if (file.Length > MaxBytes)
            return "imageTooLarge";

        Span<byte> header = stackalloc byte[12];
        using var stream = file.OpenReadStream();
        var read = stream.ReadAtLeast(header, header.Length, throwOnEndOfStream: false);
        return IsSupported(header[..read]) ? null : "imageType";
    }

    // Judge the type by the file's first bytes, not by its name or the browser's claim.
    private static bool IsSupported(ReadOnlySpan<byte> h) =>
        h.StartsWith((ReadOnlySpan<byte>)[0xFF, 0xD8, 0xFF])                                   // JPEG
        || h.StartsWith((ReadOnlySpan<byte>)[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) // PNG
        || (h.Length >= 12 && h[..4].SequenceEqual("RIFF"u8) && h[8..12].SequenceEqual("WEBP"u8));
}
