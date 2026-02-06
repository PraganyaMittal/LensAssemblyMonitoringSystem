using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FactoryMonitoringWeb.Migrations
{
    /// <inheritdoc />
    public partial class RenameTimestampToDate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_YieldRecords_MachineId_Timestamp",
                table: "YieldRecords");

            migrationBuilder.DropColumn(
                name: "Timestamp",
                table: "YieldRecords");

            migrationBuilder.AddColumn<DateTime>(
                name: "Date",
                table: "YieldRecords",
                type: "date",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.CreateIndex(
                name: "IX_YieldRecords_MachineId_Date",
                table: "YieldRecords",
                columns: new[] { "MachineId", "Date" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_YieldRecords_MachineId_Date",
                table: "YieldRecords");

            migrationBuilder.DropColumn(
                name: "Date",
                table: "YieldRecords");

            migrationBuilder.AddColumn<DateTime>(
                name: "Timestamp",
                table: "YieldRecords",
                type: "datetime2",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.CreateIndex(
                name: "IX_YieldRecords_MachineId_Timestamp",
                table: "YieldRecords",
                columns: new[] { "MachineId", "Timestamp" });
        }
    }
}
