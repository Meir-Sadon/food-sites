using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261017120000_MarketingTracking")]
    public partial class MarketingTracking : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(name: "MetaPixelId", table: "Settings", type: "text", nullable: true);
            migrationBuilder.AddColumn<string>(name: "GoogleAnalyticsId", table: "Settings", type: "text", nullable: true);
            migrationBuilder.AddColumn<string>(name: "GoogleTagManagerId", table: "Settings", type: "text", nullable: true);
            migrationBuilder.AddColumn<string>(name: "TikTokPixelId", table: "Settings", type: "text", nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "MetaPixelId", table: "Settings");
            migrationBuilder.DropColumn(name: "GoogleAnalyticsId", table: "Settings");
            migrationBuilder.DropColumn(name: "GoogleTagManagerId", table: "Settings");
            migrationBuilder.DropColumn(name: "TikTokPixelId", table: "Settings");
        }
    }
}
