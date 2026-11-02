using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class SeparateHourLimits : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "OrdersPerHourDelivery",
                table: "Settings",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "OrdersPerHourPickup",
                table: "Settings",
                type: "integer",
                nullable: true);

            migrationBuilder.UpdateData(
                table: "Settings",
                keyColumn: "Id",
                keyValue: 1,
                columns: new[] { "OrdersPerHourDelivery", "OrdersPerHourPickup" },
                values: new object[] { null, null });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "OrdersPerHourDelivery",
                table: "Settings");

            migrationBuilder.DropColumn(
                name: "OrdersPerHourPickup",
                table: "Settings");
        }
    }
}
