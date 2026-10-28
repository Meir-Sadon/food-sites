using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class PriceLists : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PriceListName",
                table: "OrderItems",
                type: "character varying(60)",
                maxLength: 60,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "PriceLists",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true),
                    IsDefault = table.Column<bool>(type: "boolean", nullable: false),
                    BaseListId = table.Column<int>(type: "integer", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PriceLists", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PriceLists_PriceLists_BaseListId",
                        column: x => x.BaseListId,
                        principalTable: "PriceLists",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PriceListDishes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    PriceListId = table.Column<int>(type: "integer", nullable: false),
                    DishId = table.Column<int>(type: "integer", nullable: false),
                    BasePrice = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: false),
                    Price = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: false),
                    From = table.Column<DateOnly>(type: "date", nullable: true),
                    To = table.Column<DateOnly>(type: "date", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PriceListDishes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PriceListDishes_Dishes_DishId",
                        column: x => x.DishId,
                        principalTable: "Dishes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PriceListDishes_PriceLists_PriceListId",
                        column: x => x.PriceListId,
                        principalTable: "PriceLists",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PriceListPhones",
                columns: table => new
                {
                    PriceListId = table.Column<int>(type: "integer", nullable: false),
                    Phone = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PriceListPhones", x => new { x.PriceListId, x.Phone });
                    table.ForeignKey(
                        name: "FK_PriceListPhones_PriceLists_PriceListId",
                        column: x => x.PriceListId,
                        principalTable: "PriceLists",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PriceListDishes_DishId",
                table: "PriceListDishes",
                column: "DishId");

            migrationBuilder.CreateIndex(
                name: "IX_PriceListDishes_PriceListId_DishId",
                table: "PriceListDishes",
                columns: new[] { "PriceListId", "DishId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PriceListPhones_Phone",
                table: "PriceListPhones",
                column: "Phone");

            migrationBuilder.CreateIndex(
                name: "IX_PriceLists_BaseListId",
                table: "PriceLists",
                column: "BaseListId");

            migrationBuilder.CreateIndex(
                name: "IX_PriceLists_IsDefault",
                table: "PriceLists",
                column: "IsDefault",
                unique: true,
                filter: "\"IsDefault\"");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PriceListDishes");

            migrationBuilder.DropTable(
                name: "PriceListPhones");

            migrationBuilder.DropTable(
                name: "PriceLists");

            migrationBuilder.DropColumn(
                name: "PriceListName",
                table: "OrderItems");
        }
    }
}
