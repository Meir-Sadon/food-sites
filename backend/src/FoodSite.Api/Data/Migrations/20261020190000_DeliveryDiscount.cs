using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261020190000_DeliveryDiscount")]
    public partial class DeliveryDiscount : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(name: "DeliveryBaseFee", table: "Settings", type: "numeric(10,2)", precision: 10, scale: 2, nullable: true);
            migrationBuilder.AddColumn<decimal>(name: "DeliveryDiscountMinOrder", table: "Settings", type: "numeric(10,2)", precision: 10, scale: 2, nullable: true);
            migrationBuilder.AddColumn<decimal>(name: "DeliveryDiscount", table: "Orders", type: "numeric(10,2)", precision: 10, scale: 2, nullable: false, defaultValue: 0m);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "DeliveryBaseFee", table: "Settings");
            migrationBuilder.DropColumn(name: "DeliveryDiscountMinOrder", table: "Settings");
            migrationBuilder.DropColumn(name: "DeliveryDiscount", table: "Orders");
        }
    }
}
