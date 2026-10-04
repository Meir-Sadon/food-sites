using System.Collections.Concurrent;
using Kuskus.Api.Messaging;

namespace Kuskus.Api.Tests;

public class CapturingWhatsAppSender : IWhatsAppSender
{
    public ConcurrentQueue<(string Phone, string Message)> Sent { get; } = new();

    /// <summary>Phones whose messages fail, to test that orders survive a WhatsApp outage.</summary>
    public HashSet<string> FailFor { get; } = [];

    public Task SendAsync(string phone, WhatsAppTemplate template, string message, CancellationToken ct = default)
    {
        if (FailFor.Contains(phone))
            throw new InvalidOperationException("WhatsApp is down");
        Sent.Enqueue((phone, message));
        return Task.CompletedTask;
    }

    public IEnumerable<string> MessagesTo(string phone) => Sent.Where(m => m.Phone == phone).Select(m => m.Message);

    /// <summary>The six digits of the latest login code sent to a phone.</summary>
    public string LastCode(string phone) =>
        System.Text.RegularExpressions.Regex.Match(MessagesTo(phone).Last(), @"\d{6}").Value;
}
