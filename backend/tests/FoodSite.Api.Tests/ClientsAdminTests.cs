using System.Net;
using System.Net.Http.Json;
using FoodSite.Api.Data.Entities;
using static FoodSite.Api.Controllers.Admin.ClientsController;

namespace FoodSite.Api.Tests;

[Collection(PostgresCollection.Name)]
public sealed class ClientsAdminTests(PostgresFixture postgres)
{
    [Fact]
    public async Task Lists_registered_clients_newest_first_for_the_admin_only()
    {
        await using var factory = new ApiFactory(postgres);
        await using (var db = factory.CreateDbContext())
        {
            db.Users.AddRange(
                new User { Phone = "0501111111", FullName = "ותיקה כהן", Address = "", CreatedAt = new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero) },
                new User { Phone = "0502222222", FullName = "חדש לוי", Address = "", Email = "n@x.co", GoogleSub = "g1", CreatedAt = new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero) });
            await db.SaveChangesAsync();
        }

        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateApiClient().GetAsync("/api/admin/clients")).StatusCode);

        var admin = await factory.CreateAdminClientAsync();
        var result = await admin.GetFromJsonAsync<ClientsDto>("/api/admin/clients", TestFiles.Json);
        Assert.Equal(2, result!.Total);
        Assert.Equal(["חדש לוי", "ותיקה כהן"], result.Clients.Select(c => c.FullName));
        Assert.True(result.Clients[0].WithGoogle);
        Assert.False(result.Clients[1].WithGoogle);
        Assert.Equal(0, result.Clients[0].Orders);
    }
}
