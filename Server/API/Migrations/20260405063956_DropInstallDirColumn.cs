using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LensAssemblyMonitoringWeb.Migrations
{
    /// <inheritdoc />
    public partial class DropInstallDirColumn : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PackageName",
                table: "UpdatePackages");

            migrationBuilder.DropColumn(
                name: "InstallDir",
                table: "LensAssemblyMCs");

            migrationBuilder.AddColumn<int>(
                name: "ErrorCount",
                table: "LensAssemblyMCs",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastDiagnostics",
                table: "LensAssemblyMCs",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MemoryMB",
                table: "LensAssemblyMCs",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ThreadCount",
                table: "LensAssemblyMCs",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "UptimeMinutes",
                table: "LensAssemblyMCs",
                type: "int",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ErrorCount",
                table: "LensAssemblyMCs");

            migrationBuilder.DropColumn(
                name: "LastDiagnostics",
                table: "LensAssemblyMCs");

            migrationBuilder.DropColumn(
                name: "MemoryMB",
                table: "LensAssemblyMCs");

            migrationBuilder.DropColumn(
                name: "ThreadCount",
                table: "LensAssemblyMCs");

            migrationBuilder.DropColumn(
                name: "UptimeMinutes",
                table: "LensAssemblyMCs");

            migrationBuilder.AddColumn<string>(
                name: "PackageName",
                table: "UpdatePackages",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "InstallDir",
                table: "LensAssemblyMCs",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: false,
                defaultValue: "");
        }
    }
}
