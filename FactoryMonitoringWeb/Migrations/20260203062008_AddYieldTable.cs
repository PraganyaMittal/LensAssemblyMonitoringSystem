using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FactoryMonitoringWeb.Migrations
{
    /// <inheritdoc />
    public partial class AddYieldTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            /*
            migrationBuilder.CreateTable(
                name: "FactoryMCs",
                columns: table => new
                {
                    MCId = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    LineNumber = table.Column<int>(type: "int", nullable: false),
                    MCNumber = table.Column<int>(type: "int", nullable: false),
                    IPAddress = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    ConfigFilePath = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    LogFolderPath = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    ModelFolderPath = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    ModelVersion = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    LogStructureJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IsApplicationRunning = table.Column<bool>(type: "bit", nullable: false),
                    IsOnline = table.Column<bool>(type: "bit", nullable: false),
                    LastHeartbeat = table.Column<DateTime>(type: "datetime2", nullable: true),
                    RegisteredDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    LastUpdated = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FactoryMCs", x => x.MCId);
                });
            */

            /*
            migrationBuilder.CreateTable(
                name: "LineTargetModels",
                columns: table => new
                {
                    LineTargetModelId = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    LineNumber = table.Column<int>(type: "int", nullable: false),
                    ModelVersion = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    TargetModelName = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    SetByUser = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    SetDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    LastUpdated = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LineTargetModels", x => x.LineTargetModelId);
                });

            migrationBuilder.CreateTable(
                name: "ModelFiles",
                columns: table => new
                {
                    ModelFileId = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ModelName = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    FileData = table.Column<byte[]>(type: "varbinary(max)", nullable: false),
                    FileName = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    FileSize = table.Column<long>(type: "bigint", nullable: false),
                    UploadedDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UploadedBy = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    IsTemplate = table.Column<bool>(type: "bit", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    Category = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ModelFiles", x => x.ModelFileId);
                });
            */

            migrationBuilder.CreateTable(
                name: "YieldRecords",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    MachineId = table.Column<int>(type: "int", nullable: false),
                    TrayId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Timestamp = table.Column<DateTime>(type: "datetime2", nullable: false),
                    GoodCount = table.Column<int>(type: "int", nullable: false),
                    TotalCount = table.Column<int>(type: "int", nullable: false),
                    YieldPercentage = table.Column<double>(type: "float", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_YieldRecords", x => x.Id);
                });

            /*
            migrationBuilder.CreateTable(
                name: "AgentCommands",
                columns: table => new
                {
                    CommandId = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    MCId = table.Column<int>(type: "int", nullable: false),
                    CommandType = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    CommandData = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    CreatedDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ExecutedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ResultData = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ErrorMessage = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AgentCommands", x => x.CommandId);
                    table.ForeignKey(
                        name: "FK_AgentCommands_FactoryMCs_MCId",
                        column: x => x.MCId,
                        principalTable: "FactoryMCs",
                        principalColumn: "MCId",
                        onDelete: ReferentialAction.Cascade);
                });

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
                    UpdatedContent = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    UpdateRequestTime = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UpdateApplied = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConfigFiles", x => x.ConfigId);
                    table.ForeignKey(
                        name: "FK_ConfigFiles_FactoryMCs_MCId",
                        column: x => x.MCId,
                        principalTable: "FactoryMCs",
                        principalColumn: "MCId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Models",
                columns: table => new
                {
                    ModelId = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    MCId = table.Column<int>(type: "int", nullable: false),
                    ModelName = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    ModelPath = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    IsCurrentModel = table.Column<bool>(type: "bit", nullable: false),
                    DiscoveredDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    LastUsed = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Models", x => x.ModelId);
                    table.ForeignKey(
                        name: "FK_Models_FactoryMCs_MCId",
                        column: x => x.MCId,
                        principalTable: "FactoryMCs",
                        principalColumn: "MCId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SystemLogs",
                columns: table => new
                {
                    LogId = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    MCId = table.Column<int>(type: "int", nullable: true),
                    Action = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    ActionType = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Details = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IPAddress = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    UserName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Timestamp = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SystemLogs", x => x.LogId);
                    table.ForeignKey(
                        name: "FK_SystemLogs_FactoryMCs_MCId",
                        column: x => x.MCId,
                        principalTable: "FactoryMCs",
                        principalColumn: "MCId");
                });

            migrationBuilder.CreateTable(
                name: "ModelDistributions",
                columns: table => new
                {
                    DistributionId = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ModelFileId = table.Column<int>(type: "int", nullable: false),
                    MCId = table.Column<int>(type: "int", nullable: true),
                    LineNumber = table.Column<int>(type: "int", nullable: true),
                    DistributionType = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    RequestedDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CompletedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ErrorMessage = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ApplyOnDownload = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ModelDistributions", x => x.DistributionId);
                    table.ForeignKey(
                        name: "FK_ModelDistributions_FactoryMCs_MCId",
                        column: x => x.MCId,
                        principalTable: "FactoryMCs",
                        principalColumn: "MCId");
                    table.ForeignKey(
                        name: "FK_ModelDistributions_ModelFiles_ModelFileId",
                        column: x => x.ModelFileId,
                        principalTable: "ModelFiles",
                        principalColumn: "ModelFileId",
                        onDelete: ReferentialAction.Cascade);
                });
            */

            /*
            migrationBuilder.CreateIndex(
                name: "IX_AgentCommands_MCId_Status",
                table: "AgentCommands",
                columns: new[] { "MCId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_ConfigFiles_MCId",
                table: "ConfigFiles",
                column: "MCId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ConfigFiles_PendingUpdate",
                table: "ConfigFiles",
                column: "PendingUpdate");

            migrationBuilder.CreateIndex(
                name: "IX_FactoryMCs_IsOnline",
                table: "FactoryMCs",
                column: "IsOnline");

            migrationBuilder.CreateIndex(
                name: "IX_FactoryMCs_LineNumber",
                table: "FactoryMCs",
                column: "LineNumber");

            migrationBuilder.CreateIndex(
                name: "IX_FactoryMCs_LineNumber_MCNumber",
                table: "FactoryMCs",
                columns: new[] { "LineNumber", "MCNumber" },
                unique: true);

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

            migrationBuilder.CreateIndex(
                name: "IX_Models_MCId_ModelName",
                table: "Models",
                columns: new[] { "MCId", "ModelName" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SystemLogs_MCId",
                table: "SystemLogs",
                column: "MCId");
            */

            migrationBuilder.CreateIndex(
                name: "IX_YieldRecords_MachineId_Timestamp",
                table: "YieldRecords",
                columns: new[] { "MachineId", "Timestamp" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AgentCommands");

            migrationBuilder.DropTable(
                name: "ConfigFiles");

            migrationBuilder.DropTable(
                name: "LineTargetModels");

            migrationBuilder.DropTable(
                name: "ModelDistributions");

            migrationBuilder.DropTable(
                name: "Models");

            migrationBuilder.DropTable(
                name: "SystemLogs");

            migrationBuilder.DropTable(
                name: "YieldRecords");

            migrationBuilder.DropTable(
                name: "ModelFiles");

            migrationBuilder.DropTable(
                name: "FactoryMCs");
        }
    }
}
