using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261022100000_SubDishImprovements")]
    public partial class SubDishImprovements : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(name: "Slot", table: "DishAddOns", type: "integer", nullable: false, defaultValue: 0);
            migrationBuilder.AddColumn<string>(name: "Label", table: "DishAddOns", type: "character varying(30)", maxLength: 30, nullable: true);
            migrationBuilder.AddColumn<bool>(name: "ShowImage", table: "DishAddOns", type: "boolean", nullable: false, defaultValue: false);
            migrationBuilder.AddColumn<bool>(name: "IsDefault", table: "DishAddOns", type: "boolean", nullable: false, defaultValue: false);
            migrationBuilder.AddColumn<decimal>(name: "OverLimitPrice", table: "DishAddOns", type: "numeric(10,2)", precision: 10, scale: 2, nullable: true);
            migrationBuilder.AddColumn<decimal>(name: "OverLimitPrice", table: "AddOnGroups", type: "numeric(10,2)", precision: 10, scale: 2, nullable: true);

            // The same add-on can be offered again under a dish (another slot).
            migrationBuilder.DropPrimaryKey(name: "PK_DishAddOns", table: "DishAddOns");
            migrationBuilder.AddPrimaryKey(name: "PK_DishAddOns", table: "DishAddOns", columns: new[] { "ParentDishId", "AddOnDishId", "Slot" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropPrimaryKey(name: "PK_DishAddOns", table: "DishAddOns");
            migrationBuilder.Sql("DELETE FROM \"DishAddOns\" WHERE \"Slot\" <> 0;");
            migrationBuilder.AddPrimaryKey(name: "PK_DishAddOns", table: "DishAddOns", columns: new[] { "ParentDishId", "AddOnDishId" });

            migrationBuilder.DropColumn(name: "Slot", table: "DishAddOns");
            migrationBuilder.DropColumn(name: "Label", table: "DishAddOns");
            migrationBuilder.DropColumn(name: "ShowImage", table: "DishAddOns");
            migrationBuilder.DropColumn(name: "IsDefault", table: "DishAddOns");
            migrationBuilder.DropColumn(name: "OverLimitPrice", table: "DishAddOns");
            migrationBuilder.DropColumn(name: "OverLimitPrice", table: "AddOnGroups");
        }
    }
}
