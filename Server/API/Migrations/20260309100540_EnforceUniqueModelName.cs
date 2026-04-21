using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LensAssemblyMonitoringWeb.Migrations
{

    public partial class EnforceUniqueModelName : Migration
    {

        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ConfigFiles");

            migrationBuilder.DropIndex(
                name: "IX_LensAssemblyMCs_LineNumber_MCNumber",
                table: "LensAssemblyMCs");

            migrationBuilder.DropColumn(
                name: "FileData",
                table: "ModelFiles");

            migrationBuilder.AddColumn<DateTime>(
                name: "DateRangeEnd",
                table: "YieldAlerts",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DateRangeStart",
                table: "YieldAlerts",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Checksum",
                table: "ModelFiles",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "ContentHash",
                table: "ModelFiles",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "StoragePath",
                table: "ModelFiles",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "AgentChecksum",
                table: "ModelDistributions",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ExpectedChecksum",
                table: "ModelDistributions",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RequestedBy",
                table: "ModelDistributions",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RetryCount",
                table: "ModelDistributions",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "StartedDate",
                table: "ModelDistributions",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "VersionNumber",
                table: "ModelDistributions",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "ModelVersions",
                columns: table => new
                {
                    ModelVersionId = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ModelFileId = table.Column<int>(type: "int", nullable: false),
                    VersionNumber = table.Column<int>(type: "int", nullable: false),
                    StoragePath = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Checksum = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    FileSize = table.Column<long>(type: "bigint", nullable: false),
                    CreatedDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    ChangeSummary = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ModelVersions", x => x.ModelVersionId);
                    table.ForeignKey(
                        name: "FK_ModelVersions_ModelFiles_ModelFileId",
                        column: x => x.ModelFileId,
                        principalTable: "ModelFiles",
                        principalColumn: "ModelFileId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ModelFiles_ContentHash",
                table: "ModelFiles",
                column: "ContentHash");

            migrationBuilder.CreateIndex(
                name: "IX_ModelFiles_ModelName",
                table: "ModelFiles",
                column: "ModelName",
                unique: true,
                filter: "[IsActive] = 1");

            migrationBuilder.CreateIndex(
                name: "IX_LensAssemblyMCs_IPAddress",
                table: "LensAssemblyMCs",
                column: "IPAddress",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LensAssemblyMCs_LineNumber_MCNumber_ModelVersion",
                table: "LensAssemblyMCs",
                columns: new[] { "LineNumber", "MCNumber", "ModelVersion" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ModelVersions_ModelFileId_VersionNumber",
                table: "ModelVersions",
                columns: new[] { "ModelFileId", "VersionNumber" },
                unique: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ModelVersions");

            migrationBuilder.DropIndex(
                name: "IX_ModelFiles_ContentHash",
                table: "ModelFiles");

            migrationBuilder.DropIndex(
                name: "IX_ModelFiles_ModelName",
                table: "ModelFiles");

            migrationBuilder.DropIndex(
                name: "IX_LensAssemblyMCs_IPAddress",
                table: "LensAssemblyMCs");

            migrationBuilder.DropIndex(
                name: "IX_LensAssemblyMCs_LineNumber_MCNumber_ModelVersion",
                table: "LensAssemblyMCs");

            migrationBuilder.DropColumn(
                name: "DateRangeEnd",
                table: "YieldAlerts");

            migrationBuilder.DropColumn(
                name: "DateRangeStart",
                table: "YieldAlerts");

            migrationBuilder.DropColumn(
                name: "Checksum",
                table: "ModelFiles");

            migrationBuilder.DropColumn(
                name: "ContentHash",
                table: "ModelFiles");

            migrationBuilder.DropColumn(
                name: "StoragePath",
                table: "ModelFiles");

            migrationBuilder.DropColumn(
                name: "AgentChecksum",
                table: "ModelDistributions");

            migrationBuilder.DropColumn(
                name: "ExpectedChecksum",
                table: "ModelDistributions");

            migrationBuilder.DropColumn(
                name: "RequestedBy",
                table: "ModelDistributions");

            migrationBuilder.DropColumn(
                name: "RetryCount",
                table: "ModelDistributions");

            migrationBuilder.DropColumn(
                name: "StartedDate",
                table: "ModelDistributions");

            migrationBuilder.DropColumn(
                name: "VersionNumber",
                table: "ModelDistributions");

            migrationBuilder.AddColumn<byte[]>(
                name: "FileData",
                table: "ModelFiles",
                type: "varbinary(max)",
                nullable: false,
                defaultValue: new byte[0]);

            migrationBuilder.CreateTable(
                name: "ConfigFiles",
                columns: table => new
                {
                    ConfigId = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    MCId = table.Column<int>(type: "int", nullable: false),
                    ConfigContent = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    LastModified = table.Column<DateTime>(type: "datetime2", nullable: false),
                    PendingUpdate = table.Column<bool>(type: "bit", nullable: false),
                    UpdateApplied = table.Column<bool>(type: "bit", nullable: false),
                    UpdateRequestTime = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UpdatedContent = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConfigFiles", x => x.ConfigId);
                    table.ForeignKey(
                        name: "FK_ConfigFiles_LensAssemblyMCs_MCId",
                        column: x => x.MCId,
                        principalTable: "LensAssemblyMCs",
                        principalColumn: "MCId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_LensAssemblyMCs_LineNumber_MCNumber",
                table: "LensAssemblyMCs",
                columns: new[] { "LineNumber", "MCNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ConfigFiles_MCId",
                table: "ConfigFiles",
                column: "MCId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ConfigFiles_PendingUpdate",
                table: "ConfigFiles",
                column: "PendingUpdate");
        }
    }
}

