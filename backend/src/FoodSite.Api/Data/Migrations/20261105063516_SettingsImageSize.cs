using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class SettingsImageSize : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ImageSize",
                table: "Settings",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.UpdateData(
                table: "Settings",
                keyColumn: "Id",
                keyValue: 1,
                column: "ImageSize",
                value: null);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ImageSize",
                table: "Settings");
        }
    }
}
