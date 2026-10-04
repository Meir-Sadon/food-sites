using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kuskus.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class DishSupplyLimit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "MaxPerSupplyDate",
                table: "Dishes",
                type: "numeric(10,3)",
                precision: 10,
                scale: 3,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "MaxPerSupplyDate",
                table: "Dishes");
        }
    }
}
