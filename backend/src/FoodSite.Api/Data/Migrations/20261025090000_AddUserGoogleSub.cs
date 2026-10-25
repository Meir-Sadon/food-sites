using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261025090000_AddUserGoogleSub")]
    public partial class AddUserGoogleSub : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(name: "GoogleSub", table: "Users", type: "text", nullable: true);
            migrationBuilder.CreateIndex(
                name: "IX_Users_GoogleSub", table: "Users", column: "GoogleSub", unique: true,
                filter: "\"GoogleSub\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(name: "IX_Users_GoogleSub", table: "Users");
            migrationBuilder.DropColumn(name: "GoogleSub", table: "Users");
        }
    }
}
