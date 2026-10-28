using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class SavedCartsAndListStatuses : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "ForMidOrder",
                table: "PriceLists",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "ForNoOrders",
                table: "PriceLists",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "NewClientsAmount",
                table: "PriceLists",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "NewClientsUnit",
                table: "PriceLists",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "OpenOrderAbove",
                table: "PriceLists",
                type: "numeric(10,2)",
                precision: 10,
                scale: 2,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "SavedCarts",
                columns: table => new
                {
                    UserId = table.Column<int>(type: "integer", nullable: false),
                    Content = table.Column<string>(type: "character varying(50000)", maxLength: 50000, nullable: false),
                    ItemCount = table.Column<int>(type: "integer", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SavedCarts", x => x.UserId);
                    table.ForeignKey(
                        name: "FK_SavedCarts_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SavedCarts");

            migrationBuilder.DropColumn(
                name: "ForMidOrder",
                table: "PriceLists");

            migrationBuilder.DropColumn(
                name: "ForNoOrders",
                table: "PriceLists");

            migrationBuilder.DropColumn(
                name: "NewClientsAmount",
                table: "PriceLists");

            migrationBuilder.DropColumn(
                name: "NewClientsUnit",
                table: "PriceLists");

            migrationBuilder.DropColumn(
                name: "OpenOrderAbove",
                table: "PriceLists");
        }
    }
}
