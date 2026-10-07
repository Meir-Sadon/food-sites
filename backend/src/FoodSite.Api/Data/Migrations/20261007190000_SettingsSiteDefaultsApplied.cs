using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261007190000_SettingsSiteDefaultsApplied")]
    public partial class SettingsSiteDefaultsApplied : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // False until the startup copies the site's site.json settings in; older code ignores it.
            migrationBuilder.AddColumn<bool>(
                name: "SiteDefaultsApplied",
                table: "Settings",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "SiteDefaultsApplied", table: "Settings");
        }
    }
}
