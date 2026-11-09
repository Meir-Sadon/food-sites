using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class NotifyPhoneOrder : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "DisplayOrder",
                table: "NotifyPhones",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // Keep today's order (by id) for the numbers that already exist.
            migrationBuilder.Sql("UPDATE \"NotifyPhones\" SET \"DisplayOrder\" = \"Id\";");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DisplayOrder",
                table: "NotifyPhones");
        }
    }
}
