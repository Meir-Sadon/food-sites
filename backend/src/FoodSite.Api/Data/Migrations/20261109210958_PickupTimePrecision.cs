using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class PickupTimePrecision : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "PickupSlotMinutes",
                table: "Settings",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<TimeOnly>(
                name: "CapacityHour",
                table: "Orders",
                type: "time without time zone",
                nullable: true);

            migrationBuilder.AddColumn<TimeOnly>(
                name: "DeliveryHourEnd",
                table: "Orders",
                type: "time without time zone",
                nullable: true);

            // Orders already placed get the end of their slot from the slot length the site uses today (time wraps at midnight: 00:00 is the end of a slot reaching 24:00).
            migrationBuilder.Sql(
                """
                UPDATE "Orders" o
                SET "DeliveryHourEnd" = o."DeliveryHour" + make_interval(mins => CASE WHEN s."SlotMinutes" IN (15, 30, 60) THEN s."SlotMinutes" ELSE 60 END)
                FROM "Settings" s
                WHERE o."DeliveryHour" IS NOT NULL
                """);

            migrationBuilder.UpdateData(
                table: "Settings",
                keyColumn: "Id",
                keyValue: 1,
                column: "PickupSlotMinutes",
                value: null);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PickupSlotMinutes",
                table: "Settings");

            migrationBuilder.DropColumn(
                name: "CapacityHour",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "DeliveryHourEnd",
                table: "Orders");
        }
    }
}
