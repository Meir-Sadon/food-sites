using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class PriceListDiscountLimits : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "DiscountMaxOrders",
                table: "PriceLists",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "DiscountNextOrderOnly",
                table: "PriceLists",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "PriceListDiscountUses",
                columns: table => new
                {
                    OrderId = table.Column<int>(type: "integer", nullable: false),
                    PriceListId = table.Column<int>(type: "integer", nullable: false),
                    UserId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PriceListDiscountUses", x => new { x.OrderId, x.PriceListId });
                    table.ForeignKey(
                        name: "FK_PriceListDiscountUses_Orders_OrderId",
                        column: x => x.OrderId,
                        principalTable: "Orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PriceListDiscountUses_PriceLists_PriceListId",
                        column: x => x.PriceListId,
                        principalTable: "PriceLists",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PriceListDiscountUses_PriceListId",
                table: "PriceListDiscountUses",
                column: "PriceListId");

            migrationBuilder.CreateIndex(
                name: "IX_PriceListDiscountUses_UserId_PriceListId",
                table: "PriceListDiscountUses",
                columns: new[] { "UserId", "PriceListId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PriceListDiscountUses");

            migrationBuilder.DropColumn(
                name: "DiscountMaxOrders",
                table: "PriceLists");

            migrationBuilder.DropColumn(
                name: "DiscountNextOrderOnly",
                table: "PriceLists");
        }
    }
}
