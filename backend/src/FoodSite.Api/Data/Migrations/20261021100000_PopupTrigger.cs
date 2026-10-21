using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261021100000_PopupTrigger")]
    public partial class PopupTrigger : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Null means the old behaviour: open as soon as the page has loaded.
            migrationBuilder.AddColumn<string>(name: "PopupTrigger", table: "Settings", type: "text", nullable: true);
            migrationBuilder.AddColumn<int>(name: "PopupDelaySeconds", table: "Settings", type: "integer", nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "PopupTrigger", table: "Settings");
            migrationBuilder.DropColumn(name: "PopupDelaySeconds", table: "Settings");
        }
    }
}
