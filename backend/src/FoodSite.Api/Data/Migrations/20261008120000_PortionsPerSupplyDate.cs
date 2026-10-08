using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261008120000_PortionsPerSupplyDate")]
    public partial class PortionsPerSupplyDate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Nullable: no limit, which is how every site works today.
            migrationBuilder.AddColumn<int>(
                name: "PortionsPerSupplyDate",
                table: "Settings",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "PortionsPerSupplyDate", table: "Settings");
        }
    }
}
