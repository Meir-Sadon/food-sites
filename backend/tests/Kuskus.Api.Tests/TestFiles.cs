using System.Net.Http.Json;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Kuskus.Api.Tests;

public static class TestFiles
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };

    public static byte[] Png => [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 1, 2, 3];
    public static byte[] Jpeg => [0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10, 0x4A, 0x46, 0x49, 0x46, 0, 1];
    public static byte[] Webp => [.. "RIFF"u8, 0x24, 0, 0, 0, .. "WEBP"u8, .. "VP8 "u8];

    public static MultipartFormDataContent Upload(byte[] bytes, string fileName = "photo.jpg", string contentType = "image/jpeg")
    {
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        return new MultipartFormDataContent { { file, "file", fileName } };
    }

    public static async Task<T> Read<T>(this HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.Content.ReadFromJsonAsync<T>(Json))!;
    }

    /// <summary>Asserts a 400 whose validation errors include this code for this field.</summary>
    public static async Task AssertInvalid(this HttpResponseMessage response, string field, string code)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == System.Net.HttpStatusCode.BadRequest, $"{(int)response.StatusCode}: {body}");
        using var doc = JsonDocument.Parse(body);
        var errors = doc.RootElement.GetProperty("errors");
        var match = errors.EnumerateObject().FirstOrDefault(p => string.Equals(p.Name, field, StringComparison.OrdinalIgnoreCase));
        Assert.True(match.Value.ValueKind == JsonValueKind.Array, $"No errors for '{field}' in {body}");
        Assert.Contains(code, match.Value.EnumerateArray().Select(e => e.GetString()));
    }
}
