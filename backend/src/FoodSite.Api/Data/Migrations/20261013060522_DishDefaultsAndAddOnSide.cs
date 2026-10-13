using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class DishDefaultsAndAddOnSide : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DefaultAnswer",
                table: "DishQuestions",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "LinkedFromAddOn",
                table: "DishAddOns",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            // A link with no settings of the parent's was, as far as can be told, ticked on the add-on's own form:
            // it keeps showing there. Links with a price, limit, group or check box were set up on the parent's form.
            migrationBuilder.Sql(
                """
                UPDATE "DishAddOns" SET "LinkedFromAddOn" = TRUE
                WHERE "Price" IS NULL AND "MaxQuantity" IS NULL AND "GroupId" IS NULL AND NOT "IsCheckbox" AND "DisplayOrder" = 0
                """);

            // Adjusting each dish (and answering its questions) is optional by default now, existing dishes included.
            migrationBuilder.Sql("UPDATE \"Dishes\" SET \"AdjustmentOptional\" = TRUE");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DefaultAnswer",
                table: "DishQuestions");

            migrationBuilder.DropColumn(
                name: "LinkedFromAddOn",
                table: "DishAddOns");
        }
    }
}
