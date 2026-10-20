using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261020190000_ItemBadges")]
    public partial class ItemBadges : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Every badge starts off and no dish is on sale. Dishes that exist already get an old creation date,
            // so none of them shows as "new" when the admin turns that badge on.
            migrationBuilder.AddColumn<bool>(name: "OnSale", table: "Dishes", type: "boolean", nullable: false, defaultValue: false);
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CreatedAt", table: "Dishes", type: "timestamp with time zone", nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(2000, 1, 1, 0, 0, 0, DateTimeKind.Utc), TimeSpan.Zero));
            migrationBuilder.AddColumn<bool>(name: "BadgeNewEnabled", table: "Settings", type: "boolean", nullable: false, defaultValue: false);
            migrationBuilder.AddColumn<int>(name: "BadgeNewAmount", table: "Settings", type: "integer", nullable: true);
            migrationBuilder.AddColumn<string>(name: "BadgeNewUnit", table: "Settings", type: "text", nullable: true);
            migrationBuilder.AddColumn<bool>(name: "BadgeLowStockEnabled", table: "Settings", type: "boolean", nullable: false, defaultValue: false);
            migrationBuilder.AddColumn<string>(name: "BadgeLowStockMode", table: "Settings", type: "text", nullable: true);
            migrationBuilder.AddColumn<int>(name: "BadgeLowStockAmount", table: "Settings", type: "integer", nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "OnSale", table: "Dishes");
            migrationBuilder.DropColumn(name: "CreatedAt", table: "Dishes");
            migrationBuilder.DropColumn(name: "BadgeNewEnabled", table: "Settings");
            migrationBuilder.DropColumn(name: "BadgeNewAmount", table: "Settings");
            migrationBuilder.DropColumn(name: "BadgeNewUnit", table: "Settings");
            migrationBuilder.DropColumn(name: "BadgeLowStockEnabled", table: "Settings");
            migrationBuilder.DropColumn(name: "BadgeLowStockMode", table: "Settings");
            migrationBuilder.DropColumn(name: "BadgeLowStockAmount", table: "Settings");
        }
    }
}
