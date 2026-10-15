using FoodSite.Api.Data;
using FoodSite.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace FoodSite.Api.Mail;

/// <summary>
/// Holds the owner-relevant changes admins saved (see <see cref="OwnerMessages.IsOwnerRelevant"/>) until they are
/// quiet for a while, so a burst of edits becomes one mail. Held in memory: a restart loses what was waiting.
/// </summary>
public class ChangeDigest(TimeProvider time)
{
    private readonly object _lock = new();
    private readonly List<AuditEntry> _entries = [];
    private DateTimeOffset _first;
    private DateTimeOffset _last;

    public void Add(IEnumerable<AuditEntry> entries)
    {
        var relevant = entries.Where(OwnerMessages.IsOwnerRelevant).ToList();
        if (relevant.Count == 0)
            return;
        lock (_lock)
        {
            var now = time.GetUtcNow();
            if (_entries.Count == 0)
                _first = now;
            _last = now;
            _entries.AddRange(relevant);
        }
    }

    /// <summary>The held changes when the quiet time or the longest wait has passed (and forgets them); else nothing.</summary>
    public List<AuditEntry> TakeDue(TimeSpan quiet, TimeSpan maxWait)
    {
        lock (_lock)
        {
            var now = time.GetUtcNow();
            if (_entries.Count == 0 || (now - _last < quiet && now - _first < maxWait))
                return [];
            var due = _entries.ToList();
            _entries.Clear();
            return due;
        }
    }
}

/// <summary>Sends the held changes to the owner as one mail.</summary>
public class ChangeDigestService(
    ChangeDigest digest, IServiceScopeFactory scopes, IOptions<MailOptions> options, ILogger<ChangeDigestService> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var o = options.Value;
        var poll = TimeSpan.FromSeconds(Math.Max(1, o.PollSeconds));
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(poll, stoppingToken);
                var due = digest.TakeDue(TimeSpan.FromSeconds(Math.Max(0, o.ChangeQuietSeconds)), TimeSpan.FromSeconds(Math.Max(0, o.ChangeMaxWaitSeconds)));
                if (due.Count == 0)
                    continue;
                await using var scope = scopes.CreateAsyncScope();
                var owner = await scope.ServiceProvider.GetRequiredService<AppDbContext>().Settings.AsNoTracking()
                    .Select(s => new { s.OwnerEmail, s.OwnerChangeMails }).SingleOrDefaultAsync(stoppingToken);
                await scope.ServiceProvider.GetRequiredService<OwnerNotifier>()
                    .ChangesAsync(owner?.OwnerEmail, owner?.OwnerChangeMails ?? false, due, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                return;
            }
            catch (Exception e)
            {
                logger.LogWarning(e, "Could not mail the owner the changes");
            }
        }
    }
}
