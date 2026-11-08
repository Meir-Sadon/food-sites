using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class NotifyPhonePushover : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PushoverKey",
                table: "NotifyPhones",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PushoverSound",
                table: "NotifyPhones",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PushoverKey",
                table: "NotifyPhones");

            migrationBuilder.DropColumn(
                name: "PushoverSound",
                table: "NotifyPhones");
        }
    }
}
