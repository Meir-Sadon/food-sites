using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kuskus.Api.Data.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261004150000_MinimumOrderAndAddressParts")]
    public partial class MinimumOrderAndAddressParts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "MinimumOrderAmount",
                table: "Settings",
                type: "numeric(10,2)",
                precision: 10,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Apartment",
                table: "Users",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "City",
                table: "Users",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "HouseNumber",
                table: "Users",
                type: "text",
                nullable: false,
                defaultValue: "");

            // Addresses saved before the split keep their text in the street field.
            migrationBuilder.AddColumn<string>(
                name: "Street",
                table: "Users",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.Sql("UPDATE \"Users\" SET \"Street\" = \"Address\"");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "MinimumOrderAmount", table: "Settings");
            migrationBuilder.DropColumn(name: "Apartment", table: "Users");
            migrationBuilder.DropColumn(name: "City", table: "Users");
            migrationBuilder.DropColumn(name: "HouseNumber", table: "Users");
            migrationBuilder.DropColumn(name: "Street", table: "Users");
        }
    }
}
