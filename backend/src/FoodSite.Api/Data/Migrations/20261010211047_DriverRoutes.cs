using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261010211047_DriverRoutes")]
    public partial class DriverRoutes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Nullable or defaulted, so older code that doesn't know them keeps writing orders.
            migrationBuilder.AddColumn<string>(
                name: "DeliveryNote",
                table: "Orders",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeliveryOutcome",
                table: "Orders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeliveryProofPublicId",
                table: "Orders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeliveryProofUrl",
                table: "Orders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeliveryReportedAt",
                table: "Orders",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "PaidByDriver",
                table: "Orders",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "DriverRoutes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Token = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    SupplyDate = table.Column<DateOnly>(type: "date", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DriverRoutes", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "DriverRouteStops",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    DriverRouteId = table.Column<int>(type: "integer", nullable: false),
                    OrderId = table.Column<int>(type: "integer", nullable: false),
                    Position = table.Column<int>(type: "integer", nullable: false),
                    PlannedArrival = table.Column<TimeOnly>(type: "time without time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DriverRouteStops", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DriverRouteStops_DriverRoutes_DriverRouteId",
                        column: x => x.DriverRouteId,
                        principalTable: "DriverRoutes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_DriverRouteStops_Orders_OrderId",
                        column: x => x.OrderId,
                        principalTable: "Orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DriverRoutes_SupplyDate",
                table: "DriverRoutes",
                column: "SupplyDate");

            migrationBuilder.CreateIndex(
                name: "IX_DriverRoutes_Token",
                table: "DriverRoutes",
                column: "Token",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_DriverRouteStops_DriverRouteId_OrderId",
                table: "DriverRouteStops",
                columns: new[] { "DriverRouteId", "OrderId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_DriverRouteStops_OrderId",
                table: "DriverRouteStops",
                column: "OrderId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DriverRouteStops");

            migrationBuilder.DropTable(
                name: "DriverRoutes");

            migrationBuilder.DropColumn(
                name: "DeliveryNote",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "DeliveryOutcome",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "DeliveryProofPublicId",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "DeliveryProofUrl",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "DeliveryReportedAt",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "PaidByDriver",
                table: "Orders");
        }
    }
}
