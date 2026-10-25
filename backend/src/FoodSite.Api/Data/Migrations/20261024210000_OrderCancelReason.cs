using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261024210000_OrderCancelReason")]
    public partial class OrderCancelReason : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(name: "CancelReason", table: "Orders", type: "character varying(300)", maxLength: 300, nullable: true);
            migrationBuilder.AddColumn<DateTimeOffset>(name: "CancelledAt", table: "Orders", type: "timestamp with time zone", nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "CancelReason", table: "Orders");
            migrationBuilder.DropColumn(name: "CancelledAt", table: "Orders");
        }
    }
}
