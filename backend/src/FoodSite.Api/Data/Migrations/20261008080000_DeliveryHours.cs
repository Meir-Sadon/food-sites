using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261008080000_DeliveryHours")]
    public partial class DeliveryHours : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // All nullable: no hours and no limit, which is how every site works today.
            migrationBuilder.AddColumn<TimeOnly>(
                name: "DeliveryFrom",
                table: "SupplyDays",
                type: "time without time zone",
                nullable: true);

            migrationBuilder.AddColumn<TimeOnly>(
                name: "DeliveryTo",
                table: "SupplyDays",
                type: "time without time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "OrdersPerHour",
                table: "Settings",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<TimeOnly>(
                name: "DeliveryHour",
                table: "Orders",
                type: "time without time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "DeliveryHour", table: "Orders");
            migrationBuilder.DropColumn(name: "OrdersPerHour", table: "Settings");
            migrationBuilder.DropColumn(name: "DeliveryTo", table: "SupplyDays");
            migrationBuilder.DropColumn(name: "DeliveryFrom", table: "SupplyDays");
        }
    }
}
