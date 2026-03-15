using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FactoryMonitoringWeb.Migrations
{

    public partial class AddCreatedAtToYieldRecord : Migration
    {

        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "YieldRecords",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    MachineId = table.Column<int>(type: "int", nullable: false),
                    TrayId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Date = table.Column<DateTime>(type: "date", nullable: false),
                    GoodCount = table.Column<int>(type: "int", nullable: false),
                    TotalCount = table.Column<int>(type: "int", nullable: false),
                    YieldPercentage = table.Column<double>(type: "float", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_YieldRecords", x => x.Id);
                });
            
            migrationBuilder.CreateIndex(
                name: "IX_YieldRecords_MachineId_Date",
                table: "YieldRecords",
                columns: new[] { "MachineId", "Date" });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "YieldRecords");
        }
    }
}

