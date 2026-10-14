using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261014190000_SiteColors")]
    public partial class SiteColors : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Palette",
                table: "Settings",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CustomColors",
                table: "Settings",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "LineWidth",
                table: "Settings",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "Palette", table: "Settings");
            migrationBuilder.DropColumn(name: "CustomColors", table: "Settings");
            migrationBuilder.DropColumn(name: "LineWidth", table: "Settings");
        }
    }
}
