using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class DishAvailability : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DishAvailabilityRules",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    DishId = table.Column<int>(type: "integer", nullable: false),
                    Weekday = table.Column<int>(type: "integer", nullable: false),
                    From = table.Column<TimeOnly>(type: "time without time zone", nullable: true),
                    To = table.Column<TimeOnly>(type: "time without time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DishAvailabilityRules", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DishAvailabilityRules_Dishes_DishId",
                        column: x => x.DishId,
                        principalTable: "Dishes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DishAvailabilityRules_DishId",
                table: "DishAvailabilityRules",
                column: "DishId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DishAvailabilityRules");
        }
    }
}
