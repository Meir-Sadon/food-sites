using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261007220000_OrderPaidWith")]
    public partial class OrderPaidWith : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Both nullable, so older code that doesn't know them keeps writing orders.
            migrationBuilder.AddColumn<string>(
                name: "PaidWith",
                table: "Orders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PaymentComment",
                table: "Orders",
                type: "text",
                nullable: true);

            // Orders already marked paid were paid somehow; nobody recorded how.
            migrationBuilder.Sql("""UPDATE "Orders" SET "PaidWith" = 'Unknown' WHERE "IsPaid";""");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "PaymentComment", table: "Orders");
            migrationBuilder.DropColumn(name: "PaidWith", table: "Orders");
        }
    }
}
