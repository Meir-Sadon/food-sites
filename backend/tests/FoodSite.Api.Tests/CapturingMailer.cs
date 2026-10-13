using System.Collections.Concurrent;
using FoodSite.Api.Mail;

namespace FoodSite.Api.Tests;

public class CapturingMailer : IMailer
{
    public ConcurrentQueue<(string To, string Subject, string Text)> Sent { get; } = new();

    public bool Fail { get; set; }

    public Task SendAsync(string to, string subject, string html, string text, CancellationToken ct = default)
    {
        if (Fail)
            throw new InvalidOperationException("Mail is down");
        Sent.Enqueue((to, subject, text));
        return Task.CompletedTask;
    }

    /// <summary>Waits for the background digest to send (it polls every second in tests).</summary>
    public async Task<(string To, string Subject, string Text)> NextAsync(
        Func<(string To, string Subject, string Text), bool>? match = null, int seconds = 15)
    {
        for (var i = 0; i < seconds * 10; i++)
        {
            while (Sent.TryDequeue(out var mail))
                if (match is null || match(mail))
                    return mail;
            await Task.Delay(100);
        }
        throw new TimeoutException("No mail was sent");
    }
}
