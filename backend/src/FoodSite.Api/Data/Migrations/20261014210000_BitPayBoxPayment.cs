using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261014210000_BitPayBoxPayment")]
    public partial class BitPayBoxPayment : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(name: "BitEnabled", table: "Settings", type: "boolean", nullable: false, defaultValue: false);
            migrationBuilder.AddColumn<bool>(name: "PayBoxEnabled", table: "Settings", type: "boolean", nullable: false, defaultValue: false);
            migrationBuilder.AddColumn<string>(name: "BitLink", table: "Settings", type: "text", nullable: true);
            migrationBuilder.AddColumn<string>(name: "PayBoxLink", table: "Settings", type: "text", nullable: true);

            // Sites that already took "Bit / PayBox" payments keep both choices.
            migrationBuilder.Sql("UPDATE \"Settings\" SET \"BitEnabled\" = TRUE, \"PayBoxEnabled\" = TRUE WHERE \"PaymentPhone\" IS NOT NULL AND btrim(\"PaymentPhone\") <> '';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "BitEnabled", table: "Settings");
            migrationBuilder.DropColumn(name: "PayBoxEnabled", table: "Settings");
            migrationBuilder.DropColumn(name: "BitLink", table: "Settings");
            migrationBuilder.DropColumn(name: "PayBoxLink", table: "Settings");
        }
    }
}
