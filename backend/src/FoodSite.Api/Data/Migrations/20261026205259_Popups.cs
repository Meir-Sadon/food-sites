using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class Popups : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "InactiveAfterAmount",
                table: "Settings",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InactiveAfterUnit",
                table: "Settings",
                type: "text",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Popups",
                columns: table => new
                {
                    Slot = table.Column<int>(type: "integer", nullable: false),
                    Enabled = table.Column<bool>(type: "boolean", nullable: false),
                    Size = table.Column<string>(type: "text", nullable: true),
                    Frequency = table.Column<string>(type: "text", nullable: true),
                    Trigger = table.Column<string>(type: "text", nullable: true),
                    DelaySeconds = table.Column<int>(type: "integer", nullable: true),
                    Title = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    Body = table.Column<string>(type: "character varying(600)", maxLength: 600, nullable: true),
                    ImageUrl = table.Column<string>(type: "text", nullable: true),
                    ImagePublicId = table.Column<string>(type: "text", nullable: true),
                    ButtonText = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    ButtonUrl = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Login = table.Column<string>(type: "text", nullable: true),
                    Activity = table.Column<string>(type: "text", nullable: true),
                    OrderSource = table.Column<string>(type: "text", nullable: true),
                    OrderTotal = table.Column<bool>(type: "boolean", nullable: false),
                    MinTotal = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: true),
                    MaxTotal = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Popups", x => x.Slot);
                });

            // The single pop-up kept in Settings becomes slot 1. The old columns stay (expand, then contract), unread.
            migrationBuilder.Sql("""
                INSERT INTO "Popups" ("Slot", "Enabled", "Size", "Frequency", "Trigger", "DelaySeconds", "Title", "Body", "ImageUrl", "ImagePublicId", "ButtonText", "ButtonUrl", "OrderTotal")
                SELECT 1, "PopupEnabled", "PopupSize", "PopupFrequency", "PopupTrigger", "PopupDelaySeconds", "PopupTitle", "PopupBody", "PopupImageUrl", "PopupImagePublicId", "PopupButtonText", "PopupButtonUrl", FALSE
                FROM "Settings"
                WHERE "PopupEnabled" OR "PopupTitle" IS NOT NULL OR "PopupBody" IS NOT NULL OR "PopupImageUrl" IS NOT NULL;
                """);

            migrationBuilder.UpdateData(
                table: "Settings",
                keyColumn: "Id",
                keyValue: 1,
                columns: new[] { "InactiveAfterAmount", "InactiveAfterUnit" },
                values: new object[] { null, null });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Popups");

            migrationBuilder.DropColumn(
                name: "InactiveAfterAmount",
                table: "Settings");

            migrationBuilder.DropColumn(
                name: "InactiveAfterUnit",
                table: "Settings");
        }
    }
}
