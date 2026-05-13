
using System;
using LensAssemblyMonitoringWeb.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

#nullable disable

namespace LensAssemblyMonitoringWeb.Migrations
{
    [DbContext(typeof(LensAssemblyDbContext))]
    [Migration("20260316051816_AddUpdateScheduleColumns")]
    partial class AddUpdateScheduleColumns
    {
        
        protected override void BuildTargetModel(ModelBuilder modelBuilder)
        {
#pragma warning disable 612, 618
            modelBuilder
                .HasAnnotation("ProductVersion", "8.0.0")
                .HasAnnotation("Relational:MaxIdentifierLength", 128);

            SqlServerModelBuilderExtensions.UseIdentityColumns(modelBuilder);

            modelBuilder.Entity("LensAssemblyMonitoringWeb.Models.AgentCommand", b =>
                {
                    b.Property<int>("CommandId")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("int");

                    SqlServerPropertyBuilderExtensions.UseIdentityColumn(b.Property<int>("CommandId"));

                    b.Property<string>("CommandData")
                        .HasColumnType("nvarchar(max)");

                    b.Property<string>("CommandType")
                        .IsRequired()
                        .HasMaxLength(50)
                        .HasColumnType("nvarchar(50)");

                    b.Property<DateTime>("CreatedDate")
                        .HasColumnType("datetime2");

                    b.Property<string>("ErrorMessage")
                        .HasColumnType("nvarchar(max)");

                    b.Property<DateTime?>("ExecutedDate")
                        .HasColumnType("datetime2");

                    b.Property<int>("MCId")
                        .HasColumnType("int");

                    b.Property<string>("ResultData")
                        .HasColumnType("nvarchar(max)");

                    b.Property<string>("Status")
                        .IsRequired()
                        .HasMaxLength(20)
                        .HasColumnType("nvarchar(20)");

                    b.HasKey("CommandId");

                    b.HasIndex("MCId", "Status");

                    b.ToTable("AgentCommands");
                });

            modelBuilder.Entity("LensAssemblyMonitoringWeb.Models.LensAssemblyMC", b =>
                {
                    b.Property<int>("MCId")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("int");

                    SqlServerPropertyBuilderExtensions.UseIdentityColumn(b.Property<int>("MCId"));

                    b.Property<string>("AgentVersion")
                        .HasMaxLength(50)
                        .HasColumnType("nvarchar(50)");

                    b.Property<string>("AutoUpdaterVersion")
                        .HasMaxLength(50)
                        .HasColumnType("nvarchar(50)");

                    b.Property<string>("ConfigFilePath")
                        .IsRequired()
                        .HasMaxLength(500)
                        .HasColumnType("nvarchar(500)");

                    b.Property<string>("IPAddress")
                        .IsRequired()
                        .HasMaxLength(50)
                        .HasColumnType("nvarchar(50)");

                    b.Property<string>("InstallDir")
                        .IsRequired()
                        .HasMaxLength(500)
                        .HasColumnType("nvarchar(500)");

                    b.Property<bool>("IpcConnected")
                        .HasColumnType("bit");

                    b.Property<int?>("IpcLastPingMs")
                        .HasColumnType("int");

                    b.Property<bool>("IsApplicationRunning")
                        .HasColumnType("bit");

                    b.Property<bool>("IsOnline")
                        .HasColumnType("bit");

                    b.Property<string>("LAIVersion")
                        .HasMaxLength(50)
                        .HasColumnType("nvarchar(50)");

                    b.Property<DateTime?>("LastHeartbeat")
                        .HasColumnType("datetime2");

                    b.Property<DateTime>("LastUpdated")
                        .HasColumnType("datetime2");

                    b.Property<int>("LineNumber")
                        .HasColumnType("int");

                    b.Property<string>("LogFolderPath")
                        .IsRequired()
                        .HasMaxLength(500)
                        .HasColumnType("nvarchar(500)");

                    b.Property<string>("LogStructureJson")
                        .HasColumnType("nvarchar(max)");

                    b.Property<int>("MCNumber")
                        .HasColumnType("int");

                    b.Property<string>("ModelFolderPath")
                        .IsRequired()
                        .HasMaxLength(500)
                        .HasColumnType("nvarchar(500)");

                    b.Property<string>("GenerationNo")
                        .IsRequired()
                        .HasMaxLength(20)
                        .HasColumnType("nvarchar(20)");

                    b.Property<DateTime>("RegisteredDate")
                        .HasColumnType("datetime2");

                    b.Property<string>("ServiceVersion")
                        .HasMaxLength(50)
                        .HasColumnType("nvarchar(50)");

                    b.HasKey("MCId");

                    b.HasIndex("IPAddress")
                        .IsUnique();

                    b.HasIndex("IsOnline");

                    b.HasIndex("LineNumber");

                    b.HasIndex("LineNumber", "MCNumber", "GenerationNo")
                        .IsUnique();

                    b.ToTable("LensAssemblyMCs");
                });

            modelBuilder.Entity("LensAssemblyMonitoringWeb.Models.LineTargetModel", b =>
                {
                    b.Property<int>("LineTargetModelId")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("int");

                    SqlServerPropertyBuilderExtensions.UseIdentityColumn(b.Property<int>("LineTargetModelId"));

                    b.Property<DateTime>("LastUpdated")
                        .HasColumnType("datetime2");

                    b.Property<int>("LineNumber")
                        .HasColumnType("int");

                    b.Property<string>("GenerationNo")
                        .IsRequired()
                        .HasMaxLength(20)
                        .HasColumnType("nvarchar(20)");

                    b.Property<string>("Notes")
                        .HasMaxLength(500)
                        .HasColumnType("nvarchar(500)");

                    b.Property<string>("SetByUser")
                        .HasMaxLength(100)
                        .HasColumnType("nvarchar(100)");

                    b.Property<DateTime>("SetDate")
                        .HasColumnType("datetime2");

                    b.Property<string>("TargetModelName")
                        .IsRequired()
                        .HasMaxLength(255)
                        .HasColumnType("nvarchar(255)");

                    b.HasKey("LineTargetModelId");

                    b.ToTable("LineTargetModels");
                });

            modelBuilder.Entity("LensAssemblyMonitoringWeb.Models.Model", b =>
                {
                    b.Property<int>("ModelId")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("int");

                    SqlServerPropertyBuilderExtensions.UseIdentityColumn(b.Property<int>("ModelId"));

                    b.Property<DateTime>("DiscoveredDate")
                        .HasColumnType("datetime2");

                    b.Property<bool>("IsCurrentModel")
                        .HasColumnType("bit");

                    b.Property<DateTime?>("LastUsed")
                        .HasColumnType("datetime2");

                    b.Property<int>("MCId")
                        .HasColumnType("int");

                    b.Property<string>("ModelName")
                        .IsRequired()
                        .HasMaxLength(255)
                        .HasColumnType("nvarchar(255)");

                    b.Property<string>("ModelPath")
                        .IsRequired()
                        .HasMaxLength(500)
                        .HasColumnType("nvarchar(500)");

                    b.HasKey("ModelId");

                    b.HasIndex("MCId", "ModelName")
                        .IsUnique();

                    b.ToTable("Models");
                });

            modelBuilder.Entity("LensAssemblyMonitoringWeb.Models.ModelFile", b =>
                {
                    b.Property<int>("ModelFileId")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("int");

                    SqlServerPropertyBuilderExtensions.UseIdentityColumn(b.Property<int>("ModelFileId"));

                    b.Property<string>("Category")
                        .HasMaxLength(100)
                        .HasColumnType("nvarchar(100)");

                    b.Property<string>("Checksum")
                        .IsRequired()
                        .HasMaxLength(64)
                        .HasColumnType("nvarchar(64)");

                    b.Property<string>("ContentHash")
                        .IsRequired()
                        .HasMaxLength(64)
                        .HasColumnType("nvarchar(64)");

                    b.Property<string>("Description")
                        .HasMaxLength(500)
                        .HasColumnType("nvarchar(500)");

                    b.Property<string>("FileName")
                        .IsRequired()
                        .HasMaxLength(255)
                        .HasColumnType("nvarchar(255)");

                    b.Property<long>("FileSize")
                        .HasColumnType("bigint");

                    b.Property<bool>("IsActive")
                        .HasColumnType("bit");

                    b.Property<bool>("IsTemplate")
                        .HasColumnType("bit");

                    b.Property<string>("ModelName")
                        .IsRequired()
                        .HasMaxLength(255)
                        .HasColumnType("nvarchar(255)");

                    b.Property<string>("StoragePath")
                        .IsRequired()
                        .HasMaxLength(500)
                        .HasColumnType("nvarchar(500)");

                    b.Property<string>("UploadedBy")
                        .HasMaxLength(100)
                        .HasColumnType("nvarchar(100)");

                    b.Property<DateTime>("UploadedDate")
                        .HasColumnType("datetime2");

                    b.HasKey("ModelFileId");

                    b.HasIndex("ContentHash");

                    b.HasIndex("ModelName");

                    b.ToTable("ModelFiles");
                });

            modelBuilder.Entity("LensAssemblyMonitoringWeb.Models.GenerationNo", b =>
                {
                    b.Property<int>("GenerationNoId")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("int");

                    SqlServerPropertyBuilderExtensions.UseIdentityColumn(b.Property<int>("GenerationNoId"));

                    b.Property<string>("ChangeSummary")
                        .HasMaxLength(500)
                        .HasColumnType("nvarchar(500)");

                    b.Property<string>("Checksum")
                        .IsRequired()
                        .HasMaxLength(64)
                        .HasColumnType("nvarchar(64)");

                    b.Property<string>("CreatedBy")
                        .HasMaxLength(100)
                        .HasColumnType("nvarchar(100)");

                    b.Property<DateTime>("CreatedDate")
                        .HasColumnType("datetime2");

                    b.Property<long>("FileSize")
                        .HasColumnType("bigint");

                    b.Property<int>("ModelFileId")
                        .HasColumnType("int");

                    b.Property<string>("StoragePath")
                        .IsRequired()
                        .HasMaxLength(500)
                        .HasColumnType("nvarchar(500)");

                    b.Property<int>("VersionNumber")
                        .HasColumnType("int");

                    b.HasKey("GenerationNoId");

                    b.HasIndex("ModelFileId", "VersionNumber")
                        .IsUnique();

                    b.ToTable("GenerationNos");
                });

            modelBuilder.Entity("LensAssemblyMonitoringWeb.Models.SystemLog", b =>
                {
                    b.Property<int>("LogId")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("int");

                    SqlServerPropertyBuilderExtensions.UseIdentityColumn(b.Property<int>("LogId"));

                    b.Property<string>("Action")
                        .IsRequired()
                        .HasMaxLength(255)
                        .HasColumnType("nvarchar(255)");

                    b.Property<string>("ActionType")
                        .IsRequired()
                        .HasMaxLength(50)
                        .HasColumnType("nvarchar(50)");

                    b.Property<string>("Details")
                        .HasColumnType("nvarchar(max)");

                    b.Property<string>("IPAddress")
                        .HasMaxLength(50)
                        .HasColumnType("nvarchar(50)");

                    b.Property<int?>("MCId")
                        .HasColumnType("int");

                    b.Property<DateTime>("Timestamp")
                        .HasColumnType("datetime2");

                    b.Property<string>("UserName")
                        .HasMaxLength(100)
                        .HasColumnType("nvarchar(100)");

                    b.HasKey("LogId");

                    b.HasIndex("MCId");

                    b.ToTable("SystemLogs");
                });

            modelBuilder.Entity("LensAssemblyMonitoringWeb.Models.UpdateDeployment", b =>
                {
                    b.Property<int>("UpdateDeploymentId")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("int");

                    SqlServerPropertyBuilderExtensions.UseIdentityColumn(b.Property<int>("UpdateDeploymentId"));

                    b.Property<int?>("AgentCommandId")
                        .HasColumnType("int");

                    b.Property<int>("AttemptCount")
                        .HasColumnType("int");

                    b.Property<DateTime?>("CompletedDateUtc")
                        .HasColumnType("datetime2");

                    b.Property<string>("ErrorMessage")
                        .HasMaxLength(2000)
                        .HasColumnType("nvarchar(2000)");

                    b.Property<int>("ExecutionOrder")
                        .HasColumnType("int");

                    b.Property<int>("MCId")
                        .HasColumnType("int");

                    b.Property<int>("MaxAttempts")
                        .HasColumnType("int");

                    b.Property<string>("PreviousVersion")
                        .HasMaxLength(50)
                        .HasColumnType("nvarchar(50)");

                    b.Property<string>("ReportedAgentVersion")
                        .HasMaxLength(50)
                        .HasColumnType("nvarchar(50)");

                    b.Property<string>("ReportedServiceVersion")
                        .HasMaxLength(50)
                        .HasColumnType("nvarchar(50)");

                    b.Property<string>("ReportedUpdaterVersion")
                        .HasMaxLength(50)
                        .HasColumnType("nvarchar(50)");

                    b.Property<byte[]>("RowVersion")
                        .IsConcurrencyToken()
                        .IsRequired()
                        .ValueGeneratedOnAddOrUpdate()
                        .HasColumnType("rowversion");

                    b.Property<DateTime?>("StartedDateUtc")
                        .HasColumnType("datetime2");

                    b.Property<string>("Status")
                        .IsRequired()
                        .HasMaxLength(20)
                        .HasColumnType("nvarchar(20)");

                    b.Property<int>("UpdateScheduleId")
                        .HasColumnType("int");

                    b.HasKey("UpdateDeploymentId");

                    b.HasIndex("AgentCommandId");

                    b.HasIndex("MCId");

                    b.HasIndex("Status");

                    b.HasIndex("UpdateScheduleId", "MCId")
                        .IsUnique();

                    b.ToTable("UpdateDeployments");
                });

            modelBuilder.Entity("LensAssemblyMonitoringWeb.Models.UpdatePackage", b =>
                {
                    b.Property<int>("UpdatePackageId")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("int");

                    SqlServerPropertyBuilderExtensions.UseIdentityColumn(b.Property<int>("UpdatePackageId"));

                    b.Property<DateTime?>("ArchivedDate")
                        .HasColumnType("datetime2");

                    b.Property<string>("Description")
                        .HasMaxLength(2000)
                        .HasColumnType("nvarchar(2000)");

                    b.Property<string>("FileHash")
                        .IsRequired()
                        .HasMaxLength(128)
                        .HasColumnType("nvarchar(128)");

                    b.Property<string>("FileName")
                        .IsRequired()
                        .HasMaxLength(500)
                        .HasColumnType("nvarchar(500)");

                    b.Property<long>("FileSize")
                        .HasColumnType("bigint");

                    b.Property<bool>("IsActive")
                        .HasColumnType("bit");

                    b.Property<string>("PackageName")
                        .IsRequired()
                        .HasMaxLength(200)
                        .HasColumnType("nvarchar(200)");

                    b.Property<string>("PackageType")
                        .IsRequired()
                        .HasMaxLength(20)
                        .HasColumnType("nvarchar(20)");

                    b.Property<byte[]>("RowVersion")
                        .IsConcurrencyToken()
                        .IsRequired()
                        .ValueGeneratedOnAddOrUpdate()
                        .HasColumnType("rowversion");

                    b.Property<string>("StoragePath")
                        .IsRequired()
                        .HasMaxLength(1000)
                        .HasColumnType("nvarchar(1000)");

                    b.Property<string>("UploadedBy")
                        .IsRequired()
                        .HasMaxLength(100)
                        .HasColumnType("nvarchar(100)");

                    b.Property<DateTime>("UploadedDate")
                        .HasColumnType("datetime2");

                    b.Property<string>("Version")
                        .IsRequired()
                        .HasMaxLength(50)
                        .HasColumnType("nvarchar(50)");

                    b.HasKey("UpdatePackageId");

                    b.HasIndex("PackageType", "Version")
                        .IsUnique()
                        .HasFilter("[IsActive] = 1");

                    b.ToTable("UpdatePackages");
                });

            modelBuilder.Entity("LensAssemblyMonitoringWeb.Models.UpdateSchedule", b =>
                {
                    b.Property<int>("UpdateScheduleId")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("int");

                    SqlServerPropertyBuilderExtensions.UseIdentityColumn(b.Property<int>("UpdateScheduleId"));

                    b.Property<string>("CancelledBy")
                        .HasMaxLength(100)
                        .HasColumnType("nvarchar(100)");

                    b.Property<DateTime?>("CancelledDateUtc")
                        .HasColumnType("datetime2");

                    b.Property<DateTime?>("CompletedDateUtc")
                        .HasColumnType("datetime2");

                    b.Property<string>("CreatedBy")
                        .IsRequired()
                        .HasMaxLength(100)
                        .HasColumnType("nvarchar(100)");

                    b.Property<DateTime>("CreatedDateUtc")
                        .HasColumnType("datetime2");

                    b.Property<DateTime?>("DispatchedDateUtc")
                        .HasColumnType("datetime2");

                    b.Property<string>("HaltReason")
                        .HasMaxLength(2000)
                        .HasColumnType("nvarchar(2000)");

                    b.Property<int?>("HaltedAtMCId")
                        .HasColumnType("int");

                    b.Property<bool>("IsActive")
                        .HasColumnType("bit");

                    b.Property<bool>("IsRollback")
                        .HasColumnType("bit");

                    b.Property<int?>("OriginalScheduleId")
                        .HasColumnType("int");

                    b.Property<byte[]>("RowVersion")
                        .IsConcurrencyToken()
                        .IsRequired()
                        .ValueGeneratedOnAddOrUpdate()
                        .HasColumnType("rowversion");

                    b.Property<string>("ScheduleName")
                        .IsRequired()
                        .HasMaxLength(200)
                        .HasColumnType("nvarchar(200)");

                    b.Property<string>("ScheduleType")
                        .IsRequired()
                        .HasMaxLength(20)
                        .HasColumnType("nvarchar(20)");

                    b.Property<DateTime?>("ScheduledTimeUtc")
                        .HasColumnType("datetime2");

                    b.Property<string>("Status")
                        .IsRequired()
                        .HasMaxLength(20)
                        .HasColumnType("nvarchar(20)");

                    b.Property<string>("TargetFilter")
                        .HasColumnType("nvarchar(max)");

                    b.Property<string>("TargetType")
                        .IsRequired()
                        .HasMaxLength(30)
                        .HasColumnType("nvarchar(30)");

                    b.Property<int>("TotalTargetCount")
                        .HasColumnType("int");

                    b.Property<int>("UpdatePackageId")
                        .HasColumnType("int");

                    b.HasKey("UpdateScheduleId");

                    b.HasIndex("HaltedAtMCId");

                    b.HasIndex("OriginalScheduleId");

                    b.HasIndex("Status");

                    b.HasIndex("UpdatePackageId");

                    b.HasIndex("ScheduleType", "Status");

                    b.ToTable("UpdateSchedules");
                });

            modelBuilder.Entity("LensAssemblyMonitoringWeb.Models.YieldAlert", b =>
                {
                    b.Property<int>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("int");

                    SqlServerPropertyBuilderExtensions.UseIdentityColumn(b.Property<int>("Id"));

                    b.Property<DateTime?>("AcknowledgedAt")
                        .HasColumnType("datetime2");

                    b.Property<DateTime>("CreatedAt")
                        .HasColumnType("datetime2");

                    b.Property<double>("CurrentYield")
                        .HasColumnType("float");

                    b.Property<DateTime?>("DateRangeEnd")
                        .HasColumnType("datetime2");

                    b.Property<DateTime?>("DateRangeStart")
                        .HasColumnType("datetime2");

                    b.Property<bool>("IsAcknowledged")
                        .HasColumnType("bit");

                    b.Property<bool>("IsActive")
                        .HasColumnType("bit");

                    b.Property<int>("LineNumber")
                        .HasColumnType("int");

                    b.Property<int>("MachineId")
                        .HasColumnType("int");

                    b.Property<string>("MachineName")
                        .IsRequired()
                        .HasMaxLength(100)
                        .HasColumnType("nvarchar(100)");

                    b.Property<DateTime?>("ResolvedAt")
                        .HasColumnType("datetime2");

                    b.Property<double>("Threshold")
                        .HasColumnType("float");

                    b.HasKey("Id");

                    b.ToTable("YieldAlerts");
                });

            modelBuilder.Entity("LensAssemblyMonitoringWeb.Models.YieldRecord", b =>
                {
                    b.Property<int>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("int");

                    SqlServerPropertyBuilderExtensions.UseIdentityColumn(b.Property<int>("Id"));

                    b.Property<DateTime>("CreatedAt")
                        .HasColumnType("datetime2");

                    b.Property<DateTime>("Date")
                        .HasColumnType("date");

                    b.Property<int>("GoodCount")
                        .HasColumnType("int");

                    b.Property<int>("MachineId")
                        .HasColumnType("int");

                    b.Property<int>("TotalCount")
                        .HasColumnType("int");

                    b.Property<string>("TrayId")
                        .IsRequired()
                        .HasMaxLength(100)
                        .HasColumnType("nvarchar(100)");

                    b.Property<double>("YieldPercentage")
                        .HasColumnType("float");

                    b.HasKey("Id");

                    b.HasIndex("MachineId", "Date");

                    b.ToTable("YieldRecords");
                });

            modelBuilder.Entity("LensAssemblyMonitoringWeb.Models.AgentCommand", b =>
                {
                    b.HasOne("LensAssemblyMonitoringWeb.Models.LensAssemblyMC", "LensAssemblyMC")
                        .WithMany("Commands")
                        .HasForeignKey("MCId")
                        .OnDelete(DeleteBehavior.Cascade)
                        .IsRequired();

                    b.Navigation("LensAssemblyMC");
                });

            modelBuilder.Entity("LensAssemblyMonitoringWeb.Models.Model", b =>
                {
                    b.HasOne("LensAssemblyMonitoringWeb.Models.LensAssemblyMC", "LensAssemblyMC")
                        .WithMany("Models")
                        .HasForeignKey("MCId")
                        .OnDelete(DeleteBehavior.Cascade)
                        .IsRequired();

                    b.Navigation("LensAssemblyMC");
                });

            modelBuilder.Entity("LensAssemblyMonitoringWeb.Models.GenerationNo", b =>
                {
                    b.HasOne("LensAssemblyMonitoringWeb.Models.ModelFile", "ModelFile")
                        .WithMany("GenerationNos")
                        .HasForeignKey("ModelFileId")
                        .OnDelete(DeleteBehavior.Cascade)
                        .IsRequired();

                    b.Navigation("ModelFile");
                });

            modelBuilder.Entity("LensAssemblyMonitoringWeb.Models.SystemLog", b =>
                {
                    b.HasOne("LensAssemblyMonitoringWeb.Models.LensAssemblyMC", "LensAssemblyMC")
                        .WithMany()
                        .HasForeignKey("MCId");

                    b.Navigation("LensAssemblyMC");
                });

            modelBuilder.Entity("LensAssemblyMonitoringWeb.Models.UpdateDeployment", b =>
                {
                    b.HasOne("LensAssemblyMonitoringWeb.Models.AgentCommand", "AgentCommand")
                        .WithMany()
                        .HasForeignKey("AgentCommandId");

                    b.HasOne("LensAssemblyMonitoringWeb.Models.LensAssemblyMC", "LensAssemblyMC")
                        .WithMany()
                        .HasForeignKey("MCId")
                        .OnDelete(DeleteBehavior.Cascade)
                        .IsRequired();

                    b.HasOne("LensAssemblyMonitoringWeb.Models.UpdateSchedule", "UpdateSchedule")
                        .WithMany("Deployments")
                        .HasForeignKey("UpdateScheduleId")
                        .OnDelete(DeleteBehavior.Cascade)
                        .IsRequired();

                    b.Navigation("AgentCommand");

                    b.Navigation("LensAssemblyMC");

                    b.Navigation("UpdateSchedule");
                });

            modelBuilder.Entity("LensAssemblyMonitoringWeb.Models.UpdateSchedule", b =>
                {
                    b.HasOne("LensAssemblyMonitoringWeb.Models.LensAssemblyMC", "HaltedAtMC")
                        .WithMany()
                        .HasForeignKey("HaltedAtMCId")
                        .OnDelete(DeleteBehavior.SetNull);

                    b.HasOne("LensAssemblyMonitoringWeb.Models.UpdateSchedule", "OriginalSchedule")
                        .WithMany()
                        .HasForeignKey("OriginalScheduleId")
                        .OnDelete(DeleteBehavior.Restrict);

                    b.HasOne("LensAssemblyMonitoringWeb.Models.UpdatePackage", "UpdatePackage")
                        .WithMany()
                        .HasForeignKey("UpdatePackageId")
                        .OnDelete(DeleteBehavior.Cascade)
                        .IsRequired();

                    b.Navigation("HaltedAtMC");

                    b.Navigation("OriginalSchedule");

                    b.Navigation("UpdatePackage");
                });

            modelBuilder.Entity("LensAssemblyMonitoringWeb.Models.LensAssemblyMC", b =>
                {
                    b.Navigation("Commands");

                    b.Navigation("Models");
                });

            modelBuilder.Entity("LensAssemblyMonitoringWeb.Models.ModelFile", b =>
                {
                    b.Navigation("GenerationNos");
                });

            modelBuilder.Entity("LensAssemblyMonitoringWeb.Models.UpdateSchedule", b =>
                {
                    b.Navigation("Deployments");
                });
#pragma warning restore 612, 618
        }
    }
}
