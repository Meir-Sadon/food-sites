using System.Security.Cryptography;
using System.Text;

namespace FoodSite.Api.Payments;

/// <summary>
/// The address Invoice4U calls after a payment, and the one the client returns to, carry the order id and a signature
/// only this server can make, so nobody else can post a payment result for an order or read its state.
/// </summary>
public class CardLinks(IConfiguration config)
{
    private readonly byte[] _key = Encoding.UTF8.GetBytes((config["Jwt:Secret"] ?? "") + "|card-payments|" + (config["Site:Id"] ?? ""));

    public string Sign(int orderId)
    {
        var hash = HMACSHA256.HashData(_key, Encoding.UTF8.GetBytes($"order:{orderId}"));
        return Convert.ToHexString(hash, 0, 16).ToLowerInvariant();
    }

    public bool IsValid(int orderId, string? signature) =>
        signature is { Length: 32 } && CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(signature), Encoding.ASCII.GetBytes(Sign(orderId)));

    public string CallbackUrl(string origin, int orderId) => $"{origin}/api/payments/card/callback?order={orderId}&sig={Sign(orderId)}";

    public string ReturnUrl(string origin, int orderId) => $"{origin}/order/card-return?order={orderId}&sig={Sign(orderId)}";
}
