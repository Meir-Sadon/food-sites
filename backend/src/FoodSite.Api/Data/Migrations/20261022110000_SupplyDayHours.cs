using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class SupplyDayHours : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SupplyDayHours",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    SupplyDayId = table.Column<int>(type: "integer", nullable: false),
                    From = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    To = table.Column<TimeOnly>(type: "time without time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SupplyDayHours", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SupplyDayHours_SupplyDays_SupplyDayId",
                        column: x => x.SupplyDayId,
                        principalTable: "SupplyDays",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SupplyDayHours_SupplyDayId",
                table: "SupplyDayHours",
                column: "SupplyDayId");

            // A day used to have one range (DeliveryFrom to DeliveryTo); it becomes the day's first range.
            migrationBuilder.Sql(
                "INSERT INTO \"SupplyDayHours\" (\"SupplyDayId\", \"From\", \"To\") " +
                "SELECT \"Id\", \"DeliveryFrom\", \"DeliveryTo\" FROM \"SupplyDays\" " +
                "WHERE \"DeliveryFrom\" IS NOT NULL AND \"DeliveryTo\" IS NOT NULL AND \"DeliveryTo\" > \"DeliveryFrom\"");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SupplyDayHours");
        }
    }
}
