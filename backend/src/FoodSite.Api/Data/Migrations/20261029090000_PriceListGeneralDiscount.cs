using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class PriceListGeneralDiscount : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateOnly>(
                name: "DiscountFrom",
                table: "PriceLists",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "DiscountPercent",
                table: "PriceLists",
                type: "numeric(5,2)",
                precision: 5,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DiscountRule",
                table: "PriceLists",
                type: "character varying(10)",
                maxLength: 10,
                nullable: false,
                defaultValue: "dish");

            migrationBuilder.AddColumn<DateOnly>(
                name: "DiscountTo",
                table: "PriceLists",
                type: "date",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DiscountFrom",
                table: "PriceLists");

            migrationBuilder.DropColumn(
                name: "DiscountPercent",
                table: "PriceLists");

            migrationBuilder.DropColumn(
                name: "DiscountRule",
                table: "PriceLists");

            migrationBuilder.DropColumn(
                name: "DiscountTo",
                table: "PriceLists");
        }
    }
}
