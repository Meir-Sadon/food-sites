using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class PriceListFewerThanOrders : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // StatusesMaxOrders used to mean "at most N orders"; it now means "fewer than N", so every existing limit moves up by one.
            migrationBuilder.Sql("UPDATE \"PriceLists\" SET \"StatusesMaxOrders\" = \"StatusesMaxOrders\" + 1 WHERE \"StatusesMaxOrders\" IS NOT NULL;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("UPDATE \"PriceLists\" SET \"StatusesMaxOrders\" = GREATEST(\"StatusesMaxOrders\" - 1, 0) WHERE \"StatusesMaxOrders\" IS NOT NULL;");
        }
    }
}
