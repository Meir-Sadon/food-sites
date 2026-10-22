using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261022130000_SlotTiming")]
    public partial class SlotTiming : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(name: "SlotMinutes", table: "Settings", type: "integer", nullable: false, defaultValue: 60);
            migrationBuilder.AddColumn<bool>(name: "AlignSlots", table: "Settings", type: "boolean", nullable: false, defaultValue: false);
            migrationBuilder.AddColumn<int>(name: "DeliveryLeadMinutes", table: "Settings", type: "integer", nullable: false, defaultValue: 0);
            migrationBuilder.AddColumn<int>(name: "PickupLeadMinutes", table: "Settings", type: "integer", nullable: false, defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "SlotMinutes", table: "Settings");
            migrationBuilder.DropColumn(name: "AlignSlots", table: "Settings");
            migrationBuilder.DropColumn(name: "DeliveryLeadMinutes", table: "Settings");
            migrationBuilder.DropColumn(name: "PickupLeadMinutes", table: "Settings");
        }
    }
}
