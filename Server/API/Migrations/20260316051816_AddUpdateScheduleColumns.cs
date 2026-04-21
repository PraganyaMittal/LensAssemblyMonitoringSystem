using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LensAssemblyMonitoringWeb.Migrations
{
    
    public partial class AddUpdateScheduleColumns : Migration
    {
        
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ModelDistributions");

            migrationBuilder.DropIndex(
                name: "IX_ModelFiles_ModelName",
                table: "ModelFiles");

            migrationBuilder.AddColumn<string>(
                name: "AgentVersion",
                table: "LensAssemblyMCs",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AutoUpdaterVersion",
                table: "LensAssemblyMCs",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InstallDir",
                table: "LensAssemblyMCs",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "IpcConnected",
                table: "LensAssemblyMCs",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "IpcLastPingMs",
                table: "LensAssemblyMCs",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LAIVersion",
                table: "LensAssemblyMCs",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ServiceVersion",
                table: "LensAssemblyMCs",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "UpdatePackages",
                columns: table => new
                {
                    UpdatePackageId = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    PackageName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    PackageType = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Version = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    FileName = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    StoragePath = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    FileSize = table.Column<long>(type: "bigint", nullable: false),
                    FileHash = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    UploadedBy = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    UploadedDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    ArchivedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UpdatePackages", x => x.UpdatePackageId);
                });

            migrationBuilder.CreateTable(
                name: "UpdateSchedules",
                columns: table => new
                {
                    UpdateScheduleId = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UpdatePackageId = table.Column<int>(type: "int", nullable: false),
                    ScheduleName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    TargetType = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    TargetFilter = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ScheduleType = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    ScheduledTimeUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    TotalTargetCount = table.Column<int>(type: "int", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    CreatedDateUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    DispatchedDateUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CompletedDateUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CancelledBy = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    CancelledDateUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    OriginalScheduleId = table.Column<int>(type: "int", nullable: true),
                    IsRollback = table.Column<bool>(type: "bit", nullable: false),
                    HaltReason = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    HaltedAtMCId = table.Column<int>(type: "int", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UpdateSchedules", x => x.UpdateScheduleId);
                    table.ForeignKey(
                        name: "FK_UpdateSchedules_LensAssemblyMCs_HaltedAtMCId",
                        column: x => x.HaltedAtMCId,
                        principalTable: "LensAssemblyMCs",
                        principalColumn: "MCId",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_UpdateSchedules_UpdatePackages_UpdatePackageId",
                        column: x => x.UpdatePackageId,
                        principalTable: "UpdatePackages",
                        principalColumn: "UpdatePackageId",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_UpdateSchedules_UpdateSchedules_OriginalScheduleId",
                        column: x => x.OriginalScheduleId,
                        principalTable: "UpdateSchedules",
                        principalColumn: "UpdateScheduleId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "UpdateDeployments",
                columns: table => new
                {
                    UpdateDeploymentId = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UpdateScheduleId = table.Column<int>(type: "int", nullable: false),
                    MCId = table.Column<int>(type: "int", nullable: false),
                    AgentCommandId = table.Column<int>(type: "int", nullable: true),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    AttemptCount = table.Column<int>(type: "int", nullable: false),
                    MaxAttempts = table.Column<int>(type: "int", nullable: false),
                    PreviousVersion = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    StartedDateUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CompletedDateUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ErrorMessage = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    ExecutionOrder = table.Column<int>(type: "int", nullable: false),
                    ReportedAgentVersion = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    ReportedServiceVersion = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    ReportedUpdaterVersion = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UpdateDeployments", x => x.UpdateDeploymentId);
                    table.ForeignKey(
                        name: "FK_UpdateDeployments_AgentCommands_AgentCommandId",
                        column: x => x.AgentCommandId,
                        principalTable: "AgentCommands",
                        principalColumn: "CommandId");
                    table.ForeignKey(
                        name: "FK_UpdateDeployments_LensAssemblyMCs_MCId",
                        column: x => x.MCId,
                        principalTable: "LensAssemblyMCs",
                        principalColumn: "MCId",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_UpdateDeployments_UpdateSchedules_UpdateScheduleId",
                        column: x => x.UpdateScheduleId,
                        principalTable: "UpdateSchedules",
                        principalColumn: "UpdateScheduleId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ModelFiles_ModelName",
                table: "ModelFiles",
                column: "ModelName");

            migrationBuilder.CreateIndex(
                name: "IX_UpdateDeployments_AgentCommandId",
                table: "UpdateDeployments",
                column: "AgentCommandId");

            migrationBuilder.CreateIndex(
                name: "IX_UpdateDeployments_MCId",
                table: "UpdateDeployments",
                column: "MCId");

            migrationBuilder.CreateIndex(
                name: "IX_UpdateDeployments_Status",
                table: "UpdateDeployments",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_UpdateDeployments_UpdateScheduleId_MCId",
                table: "UpdateDeployments",
                columns: new[] { "UpdateScheduleId", "MCId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UpdatePackages_PackageType_Version",
                table: "UpdatePackages",
                columns: new[] { "PackageType", "Version" },
                unique: true,
                filter: "[IsActive] = 1");

            migrationBuilder.CreateIndex(
                name: "IX_UpdateSchedules_HaltedAtMCId",
                table: "UpdateSchedules",
                column: "HaltedAtMCId");

            migrationBuilder.CreateIndex(
                name: "IX_UpdateSchedules_OriginalScheduleId",
                table: "UpdateSchedules",
                column: "OriginalScheduleId");

            migrationBuilder.CreateIndex(
                name: "IX_UpdateSchedules_ScheduleType_Status",
                table: "UpdateSchedules",
                columns: new[] { "ScheduleType", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_UpdateSchedules_Status",
                table: "UpdateSchedules",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_UpdateSchedules_UpdatePackageId",
                table: "UpdateSchedules",
                column: "UpdatePackageId");
        }

        
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "UpdateDeployments");

            migrationBuilder.DropTable(
                name: "UpdateSchedules");

            migrationBuilder.DropTable(
                name: "UpdatePackages");

            migrationBuilder.DropIndex(
                name: "IX_ModelFiles_ModelName",
                table: "ModelFiles");

            migrationBuilder.DropColumn(
                name: "AgentVersion",
                table: "LensAssemblyMCs");

            migrationBuilder.DropColumn(
                name: "AutoUpdaterVersion",
                table: "LensAssemblyMCs");

            migrationBuilder.DropColumn(
                name: "InstallDir",
                table: "LensAssemblyMCs");

            migrationBuilder.DropColumn(
                name: "IpcConnected",
                table: "LensAssemblyMCs");

            migrationBuilder.DropColumn(
                name: "IpcLastPingMs",
                table: "LensAssemblyMCs");

            migrationBuilder.DropColumn(
                name: "LAIVersion",
                table: "LensAssemblyMCs");

            migrationBuilder.DropColumn(
                name: "ServiceVersion",
                table: "LensAssemblyMCs");

            migrationBuilder.CreateTable(
                name: "ModelDistributions",
                columns: table => new
                {
                    DistributionId = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    MCId = table.Column<int>(type: "int", nullable: true),
                    ModelFileId = table.Column<int>(type: "int", nullable: false),
                    AgentChecksum = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    ApplyOnDownload = table.Column<bool>(type: "bit", nullable: false),
                    CompletedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    DistributionType = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    ErrorMessage = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ExpectedChecksum = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    LineNumber = table.Column<int>(type: "int", nullable: true),
                    RequestedBy = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    RequestedDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    RetryCount = table.Column<int>(type: "int", nullable: false),
                    StartedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    VersionNumber = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ModelDistributions", x => x.DistributionId);
                    table.ForeignKey(
                        name: "FK_ModelDistributions_LensAssemblyMCs_MCId",
                        column: x => x.MCId,
                        principalTable: "LensAssemblyMCs",
                        principalColumn: "MCId");
                    table.ForeignKey(
                        name: "FK_ModelDistributions_ModelFiles_ModelFileId",
                        column: x => x.ModelFileId,
                        principalTable: "ModelFiles",
                        principalColumn: "ModelFileId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ModelFiles_ModelName",
                table: "ModelFiles",
                column: "ModelName",
                unique: true,
                filter: "[IsActive] = 1");

            migrationBuilder.CreateIndex(
                name: "IX_ModelDistributions_MCId",
                table: "ModelDistributions",
                column: "MCId");

            migrationBuilder.CreateIndex(
                name: "IX_ModelDistributions_ModelFileId",
                table: "ModelDistributions",
                column: "ModelFileId");

            migrationBuilder.CreateIndex(
                name: "IX_ModelDistributions_Status",
                table: "ModelDistributions",
                column: "Status");
        }
    }
}
