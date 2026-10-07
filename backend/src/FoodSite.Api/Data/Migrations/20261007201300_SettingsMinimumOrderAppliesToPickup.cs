using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261007201300_SettingsMinimumOrderAppliesToPickup")]
    public partial class SettingsMinimumOrderAppliesToPickup : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // True keeps today's behaviour (the minimum applies to every order); older code ignores it.
            migrationBuilder.AddColumn<bool>(
                name: "MinimumOrderAppliesToPickup",
                table: "Settings",
                type: "boolean",
                nullable: false,
                defaultValue: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "MinimumOrderAppliesToPickup", table: "Settings");
        }
    }
}
