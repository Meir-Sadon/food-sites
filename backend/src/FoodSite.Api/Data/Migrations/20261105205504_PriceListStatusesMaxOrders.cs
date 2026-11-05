using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class PriceListStatusesMaxOrders : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "StatusesMatchAll",
                table: "PriceLists",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "StatusesMaxOrders",
                table: "PriceLists",
                type: "integer",
                nullable: true);

            // Expand step: the old "no orders" status and the discount's own limit become the statuses' order limit.
            migrationBuilder.Sql("UPDATE \"PriceLists\" SET \"StatusesMaxOrders\" = 0 WHERE \"ForNoOrders\";");
            migrationBuilder.Sql("UPDATE \"PriceLists\" SET \"StatusesMaxOrders\" = \"DiscountMaxOrders\" WHERE \"StatusesMaxOrders\" IS NULL AND \"DiscountMaxOrders\" IS NOT NULL;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "StatusesMatchAll",
                table: "PriceLists");

            migrationBuilder.DropColumn(
                name: "StatusesMaxOrders",
                table: "PriceLists");
        }
    }
}
