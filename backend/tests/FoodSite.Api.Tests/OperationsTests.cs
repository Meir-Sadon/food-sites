using System.IO.Compression;
using System.Net;
using System.Net.Http.Json;
using FoodSite.Api.Data.Entities;
using FoodSite.Api.Messaging;
using FoodSite.Api.Reports;
using FoodSite.Api.Sites;
using Microsoft.Extensions.Options;
using static FoodSite.Api.Controllers.Admin.CategoriesController;
using static FoodSite.Api.Controllers.Admin.DishesController;
using static FoodSite.Api.Controllers.Admin.OrdersAdminController;
using static FoodSite.Api.Controllers.Admin.ReportsController;

namespace FoodSite.Api.Tests;

/// <summary>Phase 5: the admin Orders tab, cooking summary, dish-change warning and reports.</summary>
[Collection(PostgresCollection.Name)]
public sealed class OperationsTests(PostgresFixture postgres) : IAsyncLifetime
{
    private readonly ApiFactory _factory = new(postgres);
    private HttpClient _admin = null!;
    private int _categoryId;
    private int _chicken;
    private int _thigh;

    // 2030-01-06 is a Sunday; 2030-01-13 the Sunday after.
    private static readonly DateOnly Sunday = new(2030, 1, 6);
    private static readonly DateOnly NextSunday = new(2030, 1, 13);

    public async Task InitializeAsync()
    {
        _admin = await _factory.CreateAdminClientAsync();
        _categoryId = (await (await _admin.PostAsJsonAsync("/api/admin/categories", new { name = "עופות" })).Read<CategoryDto>()).Id;
        _chicken = await CreateDish("עוף בתנור", 70, false, []);
        _thigh = await CreateDish("ירך", 12, true, [_chicken]);
    }

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private async Task<int> CreateDish(string name, decimal price, bool addOnOnly, List<int> parents)
    {
        var input = new DishInput(
            name, _categoryId, null, null, SellBy.Units, ChoiceMode.Fixed, null, null, null, null, addOnOnly, false,
            [new OptionInput(null, "יחידה", 1, price, true)], parents);
        return (await (await _admin.PostAsJsonAsync("/api/admin/dishes", input, TestFiles.Json)).Read<DishDto>()).Id;
    }

    /// <summary>A chicken line (2 × 70), plus 3 thighs at 12 as its add-on when asked.</summary>
    private async Task<int> SeedOrder(DateOnly date, bool withAddOn = true, PaymentMethod payment = PaymentMethod.OnDelivery,
        OrderStatus status = OrderStatus.New)
    {
        await using var db = _factory.CreateDbContext();
        var main = new OrderItem { DishId = _chicken, DishName = "עוף בתנור", OptionLabel = "יחידה", Quantity = 2, UnitPrice = 70, LineTotal = 140 };
        var order = new Order
        {
            Phone = "0501234567", Name = "דנה", Address = "חיפה", SupplyDate = date, PaymentMethod = payment, Status = status,
            Total = 140, CreatedAt = DateTimeOffset.UtcNow, Items = [main],
        };
        if (withAddOn)
        {
            var addOn = new OrderItem { DishId = _thigh, DishName = "ירך", OptionLabel = "יחידה", Quantity = 3, UnitPrice = 12, LineTotal = 36, ParentItem = main };
            main.AddOnItems.Add(addOn);
            order.Items.Add(addOn);
            order.Total += 36;
        }
        db.Orders.Add(order);
        await db.SaveChangesAsync();
        return order.Id;
    }

    private Task<List<OrderDto>> List(string query = "") =>
        _admin.GetAsync("/api/admin/orders" + query).Read<List<OrderDto>>();

    [Theory]
    [InlineData("GET", "/api/admin/orders")]
    [InlineData("GET", "/api/admin/orders/summary?date=2030-01-06")]
    [InlineData("PUT", "/api/admin/orders/1/status")]
    [InlineData("GET", "/api/admin/reports")]
    [InlineData("GET", "/api/admin/reports/export")]
    [InlineData("GET", "/api/admin/dishes/1/affected-orders")]
    public async Task Operations_endpoints_need_an_admin_session(string method, string path)
    {
        var request = new HttpRequestMessage(new HttpMethod(method), path) { Content = JsonContent.Create(new { }) };
        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateApiClient().SendAsync(request)).StatusCode);
    }

    [Fact]
    public async Task Orders_are_listed_by_supply_day_and_filtered()
    {
        var later = await SeedOrder(NextSunday);
        var first = await SeedOrder(Sunday);
        var cancelled = await SeedOrder(Sunday, status: OrderStatus.Cancelled);

        Assert.Equal([first, cancelled, later], (await List()).Select(o => o.Id));
        Assert.Equal([later], (await List("?from=2030-01-07")).Select(o => o.Id));
        Assert.Equal([first, cancelled], (await List("?to=2030-01-06")).Select(o => o.Id));
        Assert.Equal([cancelled], (await List("?status=Cancelled")).Select(o => o.Id));

        var order = (await List()).First();
        Assert.Equal(2, order.Items.Count);
        Assert.Equal(order.Items[0].Id, order.Items[1].ParentItemId);
    }

    [Fact]
    public async Task Status_and_paid_can_be_changed()
    {
        var id = await SeedOrder(Sunday, payment: PaymentMethod.Transfer);

        Assert.Equal(HttpStatusCode.NoContent, (await _admin.PutAsJsonAsync($"/api/admin/orders/{id}/status", new { status = "Ready" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await _admin.PutAsJsonAsync($"/api/admin/orders/{id}/paid", new { isPaid = true })).StatusCode);

        var order = await _admin.GetAsync($"/api/admin/orders/{id}").Read<OrderDto>();
        Assert.Equal((OrderStatus.Ready, true), (order.Status, order.IsPaid));
        Assert.Equal(HttpStatusCode.NotFound, (await _admin.PutAsJsonAsync("/api/admin/orders/999/status", new { status = "Ready" })).StatusCode);
        // A name that isn't a status never reaches the action (JSON binding rejects it); an undefined number does.
        await (await _admin.PutAsJsonAsync($"/api/admin/orders/{id}/status", new { status = 99 })).AssertInvalid("Status", "invalid");
    }

    private static object Edit(OrderDto order, Action<Dictionary<string, object?>>? change = null)
    {
        var body = new Dictionary<string, object?>
        {
            ["name"] = order.Name, ["phone"] = order.Phone, ["address"] = order.Address, ["supplyDate"] = order.SupplyDate,
            ["fulfillmentMethod"] = "Delivery", ["paymentMethod"] = "OnDelivery", ["notes"] = null,
            ["items"] = order.Items.Select(i => new { id = i.Id, quantity = i.Quantity }).ToArray(),
        };
        change?.Invoke(body);
        return body;
    }

    [Fact]
    public async Task Editing_an_order_recalculates_the_total_and_keeps_prices()
    {
        var id = await SeedOrder(Sunday);
        var order = await _admin.GetAsync($"/api/admin/orders/{id}").Read<OrderDto>();
        var main = order.Items[0];

        var edited = await (await _admin.PutAsJsonAsync($"/api/admin/orders/{id}", Edit(order, b =>
        {
            b["name"] = " יעל ";
            b["phone"] = "+972 52-111-2222";
            b["supplyDate"] = NextSunday;
            b["items"] = order.Items.Select(i => new { id = i.Id, quantity = i.Id == main.Id ? 1m : 2m }).ToArray();
        }), TestFiles.Json)).Read<OrderDto>();

        Assert.Equal(("יעל", "0521112222", NextSunday), (edited.Name, edited.Phone, edited.SupplyDate));
        Assert.Equal(70m + 24m, edited.Total);
        Assert.Equal([70m, 12m], edited.Items.Select(i => i.UnitPrice));
    }

    [Fact]
    public async Task Removing_a_line_removes_its_add_ons_and_a_dangling_add_on_is_refused()
    {
        var id = await SeedOrder(Sunday);
        var order = await _admin.GetAsync($"/api/admin/orders/{id}").Read<OrderDto>();
        var addOn = order.Items.Single(i => i.ParentItemId is not null);

        await (await _admin.PutAsJsonAsync($"/api/admin/orders/{id}", Edit(order, b =>
            b["items"] = new[] { new { id = addOn.Id, quantity = 1m } }), TestFiles.Json)).AssertInvalid("Items", "invalid");
        await (await _admin.PutAsJsonAsync($"/api/admin/orders/{id}", Edit(order, b =>
            b["items"] = Array.Empty<object>()), TestFiles.Json)).AssertInvalid("Items", "emptyOrder");
        await (await _admin.PutAsJsonAsync($"/api/admin/orders/{id}", Edit(order, b =>
            b["items"] = order.Items.Select(i => new { id = i.Id, quantity = 0m }).ToArray()), TestFiles.Json)).AssertInvalid("Items", "quantityInvalid");

        var main = order.Items.Single(i => i.ParentItemId is null);
        var bothGone = await (await _admin.PutAsJsonAsync($"/api/admin/orders/{id}", Edit(order, b =>
            b["items"] = new[] { new { id = main.Id, quantity = 2m } }), TestFiles.Json)).Read<OrderDto>();
        Assert.Single(bothGone.Items);
        Assert.Equal(140m, bothGone.Total);
    }

    [Fact]
    public async Task A_delivery_edit_needs_an_address()
    {
        var order = await _admin.GetAsync($"/api/admin/orders/{await SeedOrder(Sunday)}").Read<OrderDto>();
        await (await _admin.PutAsJsonAsync($"/api/admin/orders/{order.Id}", Edit(order, b => b["address"] = " "), TestFiles.Json))
            .AssertInvalid("Address", "required");
    }

    [Fact]
    public async Task Cooking_summary_adds_up_each_dish_and_option_without_cancelled_orders()
    {
        await SeedOrder(Sunday);
        await SeedOrder(Sunday, withAddOn: false);
        await SeedOrder(Sunday, status: OrderStatus.Cancelled);
        await SeedOrder(NextSunday);

        var summary = await _admin.GetAsync("/api/admin/orders/summary?date=2030-01-06").Read<SummaryDto>();

        Assert.Equal(2, summary.OrderCount);
        Assert.Equal(2, summary.DeliveryCount + summary.PickupCount);
        var chicken = summary.Rows.Single(r => r.DishId == _chicken);
        Assert.Equal((4m, 2), (chicken.Quantity, chicken.Orders));
        var thigh = summary.Rows.Single(r => r.DishId == _thigh);
        Assert.Equal((3m, 1), (thigh.Quantity, thigh.Orders));
    }

    [Fact]
    public async Task Cooking_summary_counts_main_dishes_and_kinds_of_standalone_side_dishes_but_not_side_dishes_added_to_a_dish()
    {
        var pita = await CreateDish("כפיתה", 5, false, [_chicken]);
        await using (var setup = _factory.CreateDbContext())
        {
            (await setup.Dishes.FindAsync(pita))!.IsSideDish = true;
            await setup.SaveChangesAsync();
        }

        await using var db = _factory.CreateDbContext();
        var main = new OrderItem { DishId = _chicken, DishName = "עוף בתנור", OptionLabel = "יחידה", Quantity = 2, UnitPrice = 70, LineTotal = 140 };
        var withPita = new OrderItem { DishId = pita, DishName = "כפיתה", OptionLabel = "יחידה", Quantity = 3, UnitPrice = 5, LineTotal = 15, ParentItem = main };
        main.AddOnItems.Add(withPita);
        db.Orders.Add(new Order
        {
            Phone = "0501234567", Name = "דנה", Address = "חיפה", SupplyDate = Sunday, Total = 155,
            CreatedAt = DateTimeOffset.UtcNow, Items = [main, withPita],
        });
        db.Orders.Add(new Order
        {
            Phone = "0507654321", Name = "רן", Address = "חיפה", SupplyDate = Sunday, Total = 10, CreatedAt = DateTimeOffset.UtcNow,
            Items = [new OrderItem { DishId = pita, DishName = "כפיתה", OptionLabel = "יחידה", Quantity = 2, UnitPrice = 5, LineTotal = 10 }],
        });
        db.Orders.Add(new Order
        {
            Phone = "0509999999", Name = "גל", Address = "חיפה", SupplyDate = Sunday, Total = 25, CreatedAt = DateTimeOffset.UtcNow,
            Items = [new OrderItem { DishId = pita, DishName = "כפיתה", OptionLabel = "יחידה", Quantity = 5, UnitPrice = 5, LineTotal = 25 }],
        });
        await db.SaveChangesAsync();

        var summary = await _admin.GetAsync("/api/admin/orders/summary?date=2030-01-06").Read<SummaryDto>();

        Assert.Equal(2m, summary.MainDishCount);
        Assert.Equal(1, summary.SideDishCount);
    }

    [Fact]
    public async Task Affected_orders_counts_only_orders_not_yet_supplied()
    {
        await SeedOrder(new DateOnly(2030, 1, 6));
        await SeedOrder(new DateOnly(2030, 1, 13), withAddOn: false);
        await SeedOrder(new DateOnly(2030, 1, 20), status: OrderStatus.Cancelled);
        await SeedOrder(new DateOnly(2030, 1, 27), status: OrderStatus.Delivered);
        await SeedOrder(new DateOnly(2001, 1, 7));

        Assert.Equal(2, (await _admin.GetAsync($"/api/admin/dishes/{_chicken}/affected-orders").Read<AffectedOrdersDto>()).Count);
        Assert.Equal(1, (await _admin.GetAsync($"/api/admin/dishes/{_thigh}/affected-orders").Read<AffectedOrdersDto>()).Count);
        Assert.Equal(HttpStatusCode.NotFound, (await _admin.GetAsync("/api/admin/dishes/9999/affected-orders")).StatusCode);
    }

    [Fact]
    public async Task Report_sums_sales_per_week_and_dish_and_applies_filters()
    {
        await SeedOrder(Sunday);                                        // 176
        await SeedOrder(Sunday, withAddOn: false, payment: PaymentMethod.Transfer); // 140
        await SeedOrder(NextSunday, withAddOn: false);                  // 140
        await SeedOrder(NextSunday, status: OrderStatus.Cancelled);     // not counted

        var report = await _admin.GetAsync("/api/admin/reports").Read<ReportDto>();
        Assert.Equal((3, 456m), (report.Orders, report.Sales));
        Assert.Equal([Sunday, NextSunday], report.Weeks.Select(w => w.WeekStart));
        Assert.Equal((2, 316m), (report.Weeks[0].Orders, report.Weeks[0].Sales));
        Assert.Equal((6m, 420m), (report.Dishes.Single(d => d.DishId == _chicken).Quantity, report.Dishes.Single(d => d.DishId == _chicken).Sales));

        var week2 = await _admin.GetAsync("/api/admin/reports?from=2030-01-07&to=2030-01-13").Read<ReportDto>();
        Assert.Equal((1, 140m), (week2.Orders, week2.Sales));

        var transfer = await _admin.GetAsync("/api/admin/reports?paymentMethod=Transfer").Read<ReportDto>();
        Assert.Equal((1, 140m), (transfer.Orders, transfer.Sales));

        var thigh = await _admin.GetAsync($"/api/admin/reports?dishId={_thigh}").Read<ReportDto>();
        Assert.Equal((1, 36m), (thigh.Orders, thigh.Sales));

        var category = await _admin.GetAsync($"/api/admin/reports?categoryId={_categoryId}").Read<ReportDto>();
        Assert.Equal(456m, category.Sales);
    }

    [Fact]
    public async Task Report_exports_to_an_excel_workbook()
    {
        await SeedOrder(Sunday);

        var response = await _admin.GetAsync("/api/admin/reports/export");

        Assert.Equal(XlsxWriter.ContentType, response.Content.Headers.ContentType?.MediaType);
        using var zip = new ZipArchive(await response.Content.ReadAsStreamAsync());
        Assert.Contains(zip.Entries, e => e.FullName == "xl/worksheets/sheet3.xml");
    }

    [Fact]
    public void Xlsx_workbook_holds_text_numbers_and_escapes_markup()
    {
        var bytes = XlsxWriter.Write([new Sheet("דף", ["שם", "סכום"], [["עוף <b> & ירך", 12.5m], ["x", null]])]);

        using var zip = new ZipArchive(new MemoryStream(bytes));
        using var reader = new StreamReader(zip.GetEntry("xl/worksheets/sheet1.xml")!.Open());
        var sheet = reader.ReadToEnd();
        Assert.Contains("עוף &lt;b&gt; &amp; ירך", sheet);
        Assert.Contains("<c r=\"B2\"><v>12.5</v></c>", sheet);
        Assert.Contains("rightToLeft=\"1\"", sheet);
        Assert.Equal("AA", XlsxWriter.Column(26));
    }

    [Fact]
    public void Whatsapp_template_payload_flattens_the_message_and_uses_the_international_number()
    {
        var options = new WhatsAppOptions { PhoneNumberId = "1", Token = "t" };
        options.UseSiteDefaults(new SiteOptions { Id = "grape-leaves" });
        var sender = new WhatsAppCloudSender(new HttpClient(), Options.Create(options));

        var json = System.Text.Json.JsonSerializer.Serialize(sender.Payload("0501234567", WhatsAppTemplate.NewOrder, "הזמנה #1\nעוף   x2\n"));

        Assert.Contains("\"to\":\"972501234567\"", json);
        Assert.Contains("\"name\":\"grape_leaves_new_order\"", json);
        Assert.Contains("הזמנה #1 | עוף x2", System.Text.RegularExpressions.Regex.Unescape(json));
    }
}
