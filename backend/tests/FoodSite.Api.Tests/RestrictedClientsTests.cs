using System.Net;
using System.Net.Http.Json;
using FoodSite.Api.Controllers.Admin;
using FoodSite.Api.Data.Entities;
using static FoodSite.Api.Controllers.Admin.RestrictedClientsController;

namespace FoodSite.Api.Tests;

[Collection(PostgresCollection.Name)]
public sealed class RestrictedClientsTests(PostgresFixture postgres)
{
    [Fact]
    public async Task Marking_a_phone_flags_its_orders_for_the_admin_only()
    {
        await using var factory = new ApiFactory(postgres);
        int id;
        await using (var db = factory.CreateDbContext())
        {
            var order = new Order
            {
                Phone = "0501234567", Name = "דנה", Address = "חיפה", SupplyDate = new DateOnly(2030, 1, 6),
                Total = 50, CreatedAt = DateTimeOffset.UtcNow,
            };
            db.Orders.Add(order);
            await db.SaveChangesAsync();
            id = order.Id;
        }

        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateApiClient().GetAsync("/api/admin/restricted-clients")).StatusCode);

        var admin = await factory.CreateAdminClientAsync();
        var before = await admin.GetFromJsonAsync<OrdersAdminController.OrderDto>($"/api/admin/orders/{id}", TestFiles.Json);
        Assert.False(before!.Restricted);

        var added = await admin.PostAsJsonAsync("/api/admin/restricted-clients", new PhoneInput("050-123-4567"), TestFiles.Json);
        Assert.Equal(["0501234567"], (await added.Content.ReadFromJsonAsync<RestrictedDto>(TestFiles.Json))!.Phones);
        var list = await admin.GetFromJsonAsync<List<OrdersAdminController.OrderDto>>("/api/admin/orders", TestFiles.Json);
        Assert.True(list![0].Restricted);

        var message = await admin.PutAsJsonAsync("/api/admin/restricted-clients/message", new MessageInput("שלום {name}"), TestFiles.Json);
        Assert.Equal("שלום {name}", (await message.Content.ReadFromJsonAsync<RestrictedDto>(TestFiles.Json))!.Message);

        // The client side never sees the flag or the message.
        var guest = factory.CreateApiClient();
        foreach (var path in new[] { "/api/site", "/api/menu" })
        {
            var body = await (await guest.GetAsync(path)).Content.ReadAsStringAsync();
            Assert.DoesNotContain("estricted", body);
        }

        var removed = await admin.DeleteAsync("/api/admin/restricted-clients/0501234567");
        Assert.Empty((await removed.Content.ReadFromJsonAsync<RestrictedDto>(TestFiles.Json))!.Phones);
    }

    [Fact]
    public async Task Rejects_a_bad_phone()
    {
        await using var factory = new ApiFactory(postgres);
        var admin = await factory.CreateAdminClientAsync();
        var response = await admin.PostAsJsonAsync("/api/admin/restricted-clients", new PhoneInput("abc"), TestFiles.Json);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
