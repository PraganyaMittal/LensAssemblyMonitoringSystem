using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LensAssemblyMonitoringWeb.Migrations
{
    public partial class AddMCLifecycleColumns : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_LensAssemblyMCs_IPAddress",
                table: "LensAssemblyMCs");

            migrationBuilder.DropIndex(
                name: "IX_LensAssemblyMCs_LineNumber_MCNumber_GenerationNo",
                table: "LensAssemblyMCs");

            migrationBuilder.AddColumn<int>(
                name: "LifecycleCommandId",
                table: "LensAssemblyMCs",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LifecycleCompletedAtUtc",
                table: "LensAssemblyMCs",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LifecycleError",
                table: "LensAssemblyMCs",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LifecycleRequestedAtUtc",
                table: "LensAssemblyMCs",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LifecycleState",
                table: "LensAssemblyMCs",
                type: "nvarchar(30)",
                maxLength: 30,
                nullable: false,
                defaultValue: "Active");

            migrationBuilder.CreateIndex(
                name: "IX_LensAssemblyMCs_IPAddress",
                table: "LensAssemblyMCs",
                column: "IPAddress",
                unique: true,
                filter: "[LifecycleState] <> 'Decommissioned'");

            migrationBuilder.CreateIndex(
                name: "IX_LensAssemblyMCs_LifecycleState",
                table: "LensAssemblyMCs",
                column: "LifecycleState");

            migrationBuilder.CreateIndex(
                name: "IX_LensAssemblyMCs_LineNumber_MCNumber_GenerationNo",
                table: "LensAssemblyMCs",
                columns: new[] { "LineNumber", "MCNumber", "GenerationNo" },
                unique: true,
                filter: "[LifecycleState] <> 'Decommissioned'");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_LensAssemblyMCs_IPAddress",
                table: "LensAssemblyMCs");

            migrationBuilder.DropIndex(
                name: "IX_LensAssemblyMCs_LifecycleState",
                table: "LensAssemblyMCs");

            migrationBuilder.DropIndex(
                name: "IX_LensAssemblyMCs_LineNumber_MCNumber_GenerationNo",
                table: "LensAssemblyMCs");

            migrationBuilder.DropColumn(
                name: "LifecycleCommandId",
                table: "LensAssemblyMCs");

            migrationBuilder.DropColumn(
                name: "LifecycleCompletedAtUtc",
                table: "LensAssemblyMCs");

            migrationBuilder.DropColumn(
                name: "LifecycleError",
                table: "LensAssemblyMCs");

            migrationBuilder.DropColumn(
                name: "LifecycleRequestedAtUtc",
                table: "LensAssemblyMCs");

            migrationBuilder.DropColumn(
                name: "LifecycleState",
                table: "LensAssemblyMCs");

            migrationBuilder.CreateIndex(
                name: "IX_LensAssemblyMCs_IPAddress",
                table: "LensAssemblyMCs",
                column: "IPAddress",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LensAssemblyMCs_LineNumber_MCNumber_GenerationNo",
                table: "LensAssemblyMCs",
                columns: new[] { "LineNumber", "MCNumber", "GenerationNo" },
                unique: true);
        }
    }
}
