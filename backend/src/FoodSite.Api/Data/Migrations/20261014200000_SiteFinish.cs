using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261014200000_SiteFinish")]
    public partial class SiteFinish : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(name: "FontPair", table: "Settings", type: "character varying(20)", maxLength: 20, nullable: true);
            migrationBuilder.AddColumn<string>(name: "ShadowStrength", table: "Settings", type: "character varying(20)", maxLength: 20, nullable: true);
            migrationBuilder.AddColumn<string>(name: "Spacing", table: "Settings", type: "character varying(20)", maxLength: 20, nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "FontPair", table: "Settings");
            migrationBuilder.DropColumn(name: "ShadowStrength", table: "Settings");
            migrationBuilder.DropColumn(name: "Spacing", table: "Settings");
        }
    }
}
