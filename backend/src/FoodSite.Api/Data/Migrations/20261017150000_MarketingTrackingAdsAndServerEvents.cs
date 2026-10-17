using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261017150000_MarketingTrackingAdsAndServerEvents")]
    public partial class MarketingTrackingAdsAndServerEvents : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(name: "GoogleAdsId", table: "Settings", type: "text", nullable: true);
            migrationBuilder.AddColumn<string>(name: "GoogleAdsPurchaseLabel", table: "Settings", type: "text", nullable: true);
            migrationBuilder.AddColumn<string>(name: "MetaAccessToken", table: "Settings", type: "text", nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "GoogleAdsId", table: "Settings");
            migrationBuilder.DropColumn(name: "GoogleAdsPurchaseLabel", table: "Settings");
            migrationBuilder.DropColumn(name: "MetaAccessToken", table: "Settings");
        }
    }
}
