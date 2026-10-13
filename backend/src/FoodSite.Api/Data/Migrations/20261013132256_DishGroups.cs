using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class DishGroups : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DishGroups",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    DisplayOrder = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DishGroups", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "DishGroupDishes",
                columns: table => new
                {
                    GroupId = table.Column<int>(type: "integer", nullable: false),
                    DishId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DishGroupDishes", x => new { x.GroupId, x.DishId });
                    table.ForeignKey(
                        name: "FK_DishGroupDishes_DishGroups_GroupId",
                        column: x => x.GroupId,
                        principalTable: "DishGroups",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_DishGroupDishes_Dishes_DishId",
                        column: x => x.DishId,
                        principalTable: "Dishes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DishGroupDishes_DishId",
                table: "DishGroupDishes",
                column: "DishId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DishGroupDishes");

            migrationBuilder.DropTable(
                name: "DishGroups");
        }
    }
}
