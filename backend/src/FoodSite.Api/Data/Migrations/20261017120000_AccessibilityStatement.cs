using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FoodSite.Api.Data.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261017120000_AccessibilityStatement")]
    public partial class AccessibilityStatement : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(name: "AccessibilityCoordinatorName", table: "Settings", type: "text", nullable: true);
            migrationBuilder.AddColumn<string>(name: "AccessibilityCoordinatorPhone", table: "Settings", type: "text", nullable: true);
            migrationBuilder.AddColumn<string>(name: "AccessibilityCoordinatorEmail", table: "Settings", type: "text", nullable: true);
            migrationBuilder.AddColumn<string>(name: "AccessibilityNotes", table: "Settings", type: "text", nullable: true);
            migrationBuilder.AddColumn<DateTimeOffset>(name: "AccessibilityUpdatedAt", table: "Settings", type: "timestamp with time zone", nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "AccessibilityCoordinatorName", table: "Settings");
            migrationBuilder.DropColumn(name: "AccessibilityCoordinatorPhone", table: "Settings");
            migrationBuilder.DropColumn(name: "AccessibilityCoordinatorEmail", table: "Settings");
            migrationBuilder.DropColumn(name: "AccessibilityNotes", table: "Settings");
            migrationBuilder.DropColumn(name: "AccessibilityUpdatedAt", table: "Settings");
        }
    }
}
