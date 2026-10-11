using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class DishVariantsAndAddOnGroups : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsYesNo",
                table: "Dishes",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "MainDishId",
                table: "Dishes",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "UseMainDishPrice",
                table: "Dishes",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "DisplayOrder",
                table: "DishAddOns",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "GroupId",
                table: "DishAddOns",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsCheckbox",
                table: "DishAddOns",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "MaxQuantity",
                table: "DishAddOns",
                type: "numeric(10,3)",
                precision: 10,
                scale: 3,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "Price",
                table: "DishAddOns",
                type: "numeric(10,2)",
                precision: 10,
                scale: 2,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "AddOnGroups",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    DishId = table.Column<int>(type: "integer", nullable: false),
                    Name = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    MaxUnits = table.Column<int>(type: "integer", nullable: true),
                    DisplayOrder = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AddOnGroups", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AddOnGroups_Dishes_DishId",
                        column: x => x.DishId,
                        principalTable: "Dishes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Dishes_MainDishId",
                table: "Dishes",
                column: "MainDishId");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Dishes_NotOwnVariant",
                table: "Dishes",
                sql: "\"MainDishId\" <> \"Id\"");

            migrationBuilder.CreateIndex(
                name: "IX_DishAddOns_GroupId",
                table: "DishAddOns",
                column: "GroupId");

            migrationBuilder.CreateIndex(
                name: "IX_AddOnGroups_DishId",
                table: "AddOnGroups",
                column: "DishId");

            migrationBuilder.AddForeignKey(
                name: "FK_DishAddOns_AddOnGroups_GroupId",
                table: "DishAddOns",
                column: "GroupId",
                principalTable: "AddOnGroups",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_Dishes_Dishes_MainDishId",
                table: "Dishes",
                column: "MainDishId",
                principalTable: "Dishes",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_DishAddOns_AddOnGroups_GroupId",
                table: "DishAddOns");

            migrationBuilder.DropForeignKey(
                name: "FK_Dishes_Dishes_MainDishId",
                table: "Dishes");

            migrationBuilder.DropTable(
                name: "AddOnGroups");

            migrationBuilder.DropIndex(
                name: "IX_Dishes_MainDishId",
                table: "Dishes");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Dishes_NotOwnVariant",
                table: "Dishes");

            migrationBuilder.DropIndex(
                name: "IX_DishAddOns_GroupId",
                table: "DishAddOns");

            migrationBuilder.DropColumn(
                name: "IsYesNo",
                table: "Dishes");

            migrationBuilder.DropColumn(
                name: "MainDishId",
                table: "Dishes");

            migrationBuilder.DropColumn(
                name: "UseMainDishPrice",
                table: "Dishes");

            migrationBuilder.DropColumn(
                name: "DisplayOrder",
                table: "DishAddOns");

            migrationBuilder.DropColumn(
                name: "GroupId",
                table: "DishAddOns");

            migrationBuilder.DropColumn(
                name: "IsCheckbox",
                table: "DishAddOns");

            migrationBuilder.DropColumn(
                name: "MaxQuantity",
                table: "DishAddOns");

            migrationBuilder.DropColumn(
                name: "Price",
                table: "DishAddOns");
        }
    }
}
