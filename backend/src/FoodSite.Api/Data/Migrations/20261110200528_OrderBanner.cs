using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class OrderBanner : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BannerFrames",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    DisplayOrder = table.Column<int>(type: "integer", nullable: false),
                    ImageUrl = table.Column<string>(type: "text", nullable: false),
                    ImagePublicId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BannerFrames", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "OrderBanners",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Enabled = table.Column<bool>(type: "boolean", nullable: false),
                    Title = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true),
                    Tagline = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true),
                    Chips = table.Column<string>(type: "character varying(186)", maxLength: 186, nullable: true),
                    Background = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: true),
                    TextColor = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: true),
                    LogoUrl = table.Column<string>(type: "text", nullable: true),
                    LogoPublicId = table.Column<string>(type: "text", nullable: true),
                    AnimationEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    AnimationScreens = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OrderBanners", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BannerFrames");

            migrationBuilder.DropTable(
                name: "OrderBanners");
        }
    }
}
