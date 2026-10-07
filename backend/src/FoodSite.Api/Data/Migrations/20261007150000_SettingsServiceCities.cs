using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261007150000_SettingsServiceCities")]
    public partial class SettingsServiceCities : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Null until the startup seeds it from the site's site.json; older code ignores it.
            migrationBuilder.AddColumn<string>(
                name: "ServiceCities",
                table: "Settings",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "ServiceCities", table: "Settings");
        }
    }
}
