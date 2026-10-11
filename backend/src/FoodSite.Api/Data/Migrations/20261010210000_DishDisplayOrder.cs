using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261010210000_DishDisplayOrder")]
    public partial class DishDisplayOrder : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "DisplayOrder",
                table: "Dishes",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // The menu listed dishes by id until now, so number each category's dishes that way to keep today's order.
            migrationBuilder.Sql("""
                UPDATE "Dishes" AS d SET "DisplayOrder" = n.position
                FROM (SELECT "Id", ROW_NUMBER() OVER (PARTITION BY "CategoryId" ORDER BY "Id") - 1 AS position FROM "Dishes") AS n
                WHERE d."Id" = n."Id";
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "DisplayOrder", table: "Dishes");
        }
    }
}
