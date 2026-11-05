using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class OrderDeposit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "DepositMinOrder",
                table: "Settings",
                type: "numeric(10,2)",
                precision: 10,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "DepositPaid",
                table: "Orders",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "DepositRequired",
                table: "Orders",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.UpdateData(
                table: "Settings",
                keyColumn: "Id",
                keyValue: 1,
                column: "DepositMinOrder",
                value: null);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DepositMinOrder",
                table: "Settings");

            migrationBuilder.DropColumn(
                name: "DepositPaid",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "DepositRequired",
                table: "Orders");
        }
    }
}
