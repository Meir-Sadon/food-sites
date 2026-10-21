using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class EntryPopup : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PopupBody",
                table: "Settings",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PopupButtonText",
                table: "Settings",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PopupButtonUrl",
                table: "Settings",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "PopupEnabled",
                table: "Settings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "PopupFrequency",
                table: "Settings",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PopupImagePublicId",
                table: "Settings",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PopupImageUrl",
                table: "Settings",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PopupSize",
                table: "Settings",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PopupTitle",
                table: "Settings",
                type: "text",
                nullable: true);

            migrationBuilder.UpdateData(
                table: "Settings",
                keyColumn: "Id",
                keyValue: 1,
                columns: new[] { "PopupBody", "PopupButtonText", "PopupButtonUrl", "PopupEnabled", "PopupFrequency", "PopupImagePublicId", "PopupImageUrl", "PopupSize", "PopupTitle" },
                values: new object[] { null, null, null, false, null, null, null, null, null });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PopupBody",
                table: "Settings");

            migrationBuilder.DropColumn(
                name: "PopupButtonText",
                table: "Settings");

            migrationBuilder.DropColumn(
                name: "PopupButtonUrl",
                table: "Settings");

            migrationBuilder.DropColumn(
                name: "PopupEnabled",
                table: "Settings");

            migrationBuilder.DropColumn(
                name: "PopupFrequency",
                table: "Settings");

            migrationBuilder.DropColumn(
                name: "PopupImagePublicId",
                table: "Settings");

            migrationBuilder.DropColumn(
                name: "PopupImageUrl",
                table: "Settings");

            migrationBuilder.DropColumn(
                name: "PopupSize",
                table: "Settings");

            migrationBuilder.DropColumn(
                name: "PopupTitle",
                table: "Settings");
        }
    }
}
