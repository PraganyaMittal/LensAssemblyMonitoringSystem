-- ==============================================================
-- Factory Monitoring Database - Complete Setup Script
-- Generated from C# entity models + EF DbContext configuration
-- Run this script in SQL Server Management Studio (SSMS)
-- ==============================================================

USE master;
GO

-- Drop existing database if it exists (CAUTION: destroys all data)
IF EXISTS (SELECT name FROM sys.databases WHERE name = 'FactoryMonitoringDB')
BEGIN
    ALTER DATABASE FactoryMonitoringDB SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE FactoryMonitoringDB;
END
GO

CREATE DATABASE FactoryMonitoringDB;
GO

USE FactoryMonitoringDB;
GO

-- ==============================================================
-- SECTION 1: IIS App Pool Login
-- ==============================================================
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'IIS APPPOOL\FactoryMonitoring')
BEGIN
    EXEC('CREATE LOGIN [IIS APPPOOL\FactoryMonitoring] FROM WINDOWS');
    PRINT 'Login created for IIS APPPOOL\FactoryMonitoring';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'IIS APPPOOL\FactoryMonitoring')
BEGIN
    CREATE USER [IIS APPPOOL\FactoryMonitoring] FOR LOGIN [IIS APPPOOL\FactoryMonitoring];
END
GO

ALTER ROLE db_owner ADD MEMBER [IIS APPPOOL\FactoryMonitoring];
GO

PRINT '--- Database and IIS login created ---';
GO

-- ==============================================================
-- SECTION 2: CREATE ALL TABLES
-- ==============================================================

-- ============================================
-- TABLE: FactoryMCs (root table, no FKs)
-- Entity: FactoryMC.cs | DbSet: FactoryMCs
-- ============================================
CREATE TABLE FactoryMCs (
    MCId INT PRIMARY KEY IDENTITY(1,1),
    LineNumber INT NOT NULL,
    MCNumber INT NOT NULL,
    IPAddress NVARCHAR(50) NOT NULL DEFAULT '0.0.0.0',
    ConfigFilePath NVARCHAR(500) NOT NULL DEFAULT '',
    LogFolderPath NVARCHAR(500) NOT NULL DEFAULT '',
    ModelFolderPath NVARCHAR(500) NOT NULL DEFAULT '',
    ModelVersion NVARCHAR(20) NOT NULL DEFAULT '3.5',
    LogStructureJson NVARCHAR(MAX) NULL,
    IsApplicationRunning BIT NOT NULL DEFAULT 0,
    IsOnline BIT NOT NULL DEFAULT 0,
    LastHeartbeat DATETIME NULL,
    RegisteredDate DATETIME NOT NULL DEFAULT GETDATE(),
    LastUpdated DATETIME NOT NULL DEFAULT GETDATE(),
    InstallDir NVARCHAR(500) NOT NULL DEFAULT 'C:\ModalFactory\',
    CONSTRAINT UC_LineMC_Version UNIQUE(LineNumber, MCNumber, ModelVersion)
);
GO

-- ============================================
-- TABLE: ConfigFiles (1-to-1 with FactoryMCs)
-- Entity: ConfigFile.cs | DbSet: ConfigFiles
-- ============================================
CREATE TABLE ConfigFiles (
    ConfigId INT PRIMARY KEY IDENTITY(1,1),
    MCId INT NOT NULL,
    ConfigContent NVARCHAR(MAX) NOT NULL DEFAULT '',
    LastModified DATETIME NOT NULL DEFAULT GETDATE(),
    PendingUpdate BIT NOT NULL DEFAULT 0,
    UpdatedContent NVARCHAR(MAX) NULL,
    UpdateRequestTime DATETIME NULL,
    UpdateApplied BIT NOT NULL DEFAULT 0,
    CONSTRAINT FK_ConfigFiles_FactoryMCs FOREIGN KEY (MCId)
        REFERENCES FactoryMCs(MCId) ON DELETE CASCADE,
    CONSTRAINT UQ_ConfigFiles_MCId UNIQUE(MCId)
);
GO

-- ============================================
-- TABLE: Models (models discovered on PCs)
-- Entity: Model.cs | DbSet: Models
-- ============================================
CREATE TABLE Models (
    ModelId INT PRIMARY KEY IDENTITY(1,1),
    MCId INT NOT NULL,
    ModelName NVARCHAR(255) NOT NULL,
    ModelPath NVARCHAR(500) NOT NULL DEFAULT '',
    IsCurrentModel BIT NOT NULL DEFAULT 0,
    DiscoveredDate DATETIME NOT NULL DEFAULT GETDATE(),
    LastUsed DATETIME NULL,
    CONSTRAINT FK_Models_FactoryMCs FOREIGN KEY (MCId)
        REFERENCES FactoryMCs(MCId) ON DELETE CASCADE,
    CONSTRAINT UQ_Models_MCId_ModelName UNIQUE(MCId, ModelName)
);
GO

-- ============================================
-- TABLE: ModelFiles (model library / uploaded ZIPs)
-- Entity: ModelFile.cs | DbSet: ModelFiles
-- ============================================
CREATE TABLE ModelFiles (
    ModelFileId INT PRIMARY KEY IDENTITY(1,1),
    ModelName NVARCHAR(255) NOT NULL,
    FileData VARBINARY(MAX) NOT NULL,
    FileName NVARCHAR(255) NOT NULL,
    FileSize BIGINT NOT NULL,
    UploadedDate DATETIME NOT NULL DEFAULT GETDATE(),
    UploadedBy NVARCHAR(100) NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    IsTemplate BIT NOT NULL DEFAULT 0,
    Description NVARCHAR(500) NULL,
    Category NVARCHAR(100) NULL
);
GO

-- ============================================
-- TABLE: ModelDistributions (deployment records)
-- Entity: ModelDistribution.cs | DbSet: ModelDistributions
-- ============================================
CREATE TABLE ModelDistributions (
    DistributionId INT PRIMARY KEY IDENTITY(1,1),
    ModelFileId INT NOT NULL,
    MCId INT NULL,
    LineNumber INT NULL,
    DistributionType NVARCHAR(20) NOT NULL DEFAULT 'Single',
    Status NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    RequestedDate DATETIME NOT NULL DEFAULT GETDATE(),
    CompletedDate DATETIME NULL,
    ErrorMessage NVARCHAR(MAX) NULL,
    ApplyOnDownload BIT NOT NULL DEFAULT 0,
    CONSTRAINT FK_ModelDistributions_ModelFiles FOREIGN KEY (ModelFileId)
        REFERENCES ModelFiles(ModelFileId) ON DELETE CASCADE,
    CONSTRAINT FK_ModelDistributions_FactoryMCs FOREIGN KEY (MCId)
        REFERENCES FactoryMCs(MCId) ON DELETE SET NULL
);
GO

-- ============================================
-- TABLE: AgentCommands (commands queued for agents)
-- Entity: AgentCommand.cs | DbSet: AgentCommands
-- ============================================
CREATE TABLE AgentCommands (
    CommandId INT PRIMARY KEY IDENTITY(1,1),
    MCId INT NOT NULL,
    CommandType NVARCHAR(50) NOT NULL,
    CommandData NVARCHAR(MAX) NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    CreatedDate DATETIME NOT NULL DEFAULT GETDATE(),
    ExecutedDate DATETIME NULL,
    ResultData NVARCHAR(MAX) NULL,
    ErrorMessage NVARCHAR(MAX) NULL,
    CONSTRAINT FK_AgentCommands_FactoryMCs FOREIGN KEY (MCId)
        REFERENCES FactoryMCs(MCId) ON DELETE CASCADE
);
GO

-- ============================================
-- TABLE: SystemLogs (audit / activity log)
-- Entity: SystemLog.cs | DbSet: SystemLogs
-- ============================================
CREATE TABLE SystemLogs (
    LogId INT PRIMARY KEY IDENTITY(1,1),
    MCId INT NULL,
    Action NVARCHAR(255) NOT NULL,
    ActionType NVARCHAR(50) NOT NULL DEFAULT 'Info',
    Details NVARCHAR(MAX) NULL,
    IPAddress NVARCHAR(50) NULL,
    UserName NVARCHAR(100) NULL,
    Timestamp DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_SystemLogs_FactoryMCs FOREIGN KEY (MCId)
        REFERENCES FactoryMCs(MCId) ON DELETE SET NULL
);
GO

-- ============================================
-- TABLE: LineTargetModels (target model per line+version)
-- Entity: LineTargetModel.cs | DbSet: LineTargetModels
-- ============================================
CREATE TABLE LineTargetModels (
    LineTargetModelId INT PRIMARY KEY IDENTITY(1,1),
    LineNumber INT NOT NULL,
    ModelVersion NVARCHAR(20) NOT NULL DEFAULT '3.5',
    TargetModelName NVARCHAR(255) NOT NULL,
    SetByUser NVARCHAR(100) NULL,
    SetDate DATETIME NOT NULL DEFAULT GETDATE(),
    LastUpdated DATETIME NOT NULL DEFAULT GETDATE(),
    Notes NVARCHAR(500) NULL,
    CONSTRAINT UC_LineNumber_Version UNIQUE(LineNumber, ModelVersion)
);
GO

-- ============================================
-- TABLE: YieldRecords (tray-level yield data)
-- Entity: YieldRecord.cs | DbSet: YieldRecords
-- ============================================
CREATE TABLE YieldRecords (
    Id INT PRIMARY KEY IDENTITY(1,1),
    MachineId INT NOT NULL,
    Date DATE NOT NULL,
    TrayId NVARCHAR(100) NOT NULL DEFAULT '',
    GoodCount INT NOT NULL,
    TotalCount INT NOT NULL,
    YieldPercentage FLOAT NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE()
);
GO

-- ============================================
-- TABLE: YieldAlerts (low-yield notifications)
-- Entity: YieldAlert.cs | DbSet: YieldAlerts
-- ============================================
CREATE TABLE YieldAlerts (
    Id INT PRIMARY KEY IDENTITY(1,1),
    MachineId INT NOT NULL,
    MachineName NVARCHAR(100) NOT NULL,
    LineNumber INT NOT NULL,
    CurrentYield FLOAT NOT NULL,
    Threshold FLOAT NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    IsActive BIT NOT NULL DEFAULT 1,
    IsAcknowledged BIT NOT NULL DEFAULT 0,
    AcknowledgedAt DATETIME NULL,
    ResolvedAt DATETIME NULL,
    DateRangeStart DATETIME NULL,
    DateRangeEnd DATETIME NULL,
    CONSTRAINT FK_YieldAlerts_FactoryMCs FOREIGN KEY (MachineId)
        REFERENCES FactoryMCs(MCId) ON DELETE CASCADE
);
GO

-- ============================================
-- TABLE: ModelVersions (version history for library models)
-- Entity: ModelVersion.cs | DbSet: ModelVersions
-- ============================================
CREATE TABLE ModelVersions (
    ModelVersionId INT PRIMARY KEY IDENTITY(1,1),
    ModelFileId INT NOT NULL,
    VersionNumber INT NOT NULL,
    FileData VARBINARY(MAX) NOT NULL,
    CreatedDate DATETIME NOT NULL DEFAULT GETDATE(),
    CreatedBy NVARCHAR(100) NULL,
    ChangeSummary NVARCHAR(500) NULL,
    CONSTRAINT FK_ModelVersions_ModelFiles FOREIGN KEY (ModelFileId)
        REFERENCES ModelFiles(ModelFileId) ON DELETE CASCADE
);
GO

-- ============================================
-- TABLE: UpdatePackages (uploaded update .zip files)
-- Entity: UpdatePackage.cs | DbSet: UpdatePackages
-- Feature 1: Package Library
-- ============================================
CREATE TABLE UpdatePackages (
    UpdatePackageId INT PRIMARY KEY IDENTITY(1,1),
    PackageName NVARCHAR(200) NOT NULL,
    PackageType NVARCHAR(20) NOT NULL,              -- 'LAI' or 'Agent'
    Version NVARCHAR(50) NOT NULL,
    FileName NVARCHAR(500) NOT NULL,                -- Original upload filename
    StoragePath NVARCHAR(1000) NOT NULL,            -- GUID-based path on disk
    FileSize BIGINT NOT NULL,
    FileHash NVARCHAR(128) NOT NULL,                -- SHA-256 hash
    Description NVARCHAR(2000) NULL,                -- Release notes
    UploadedBy NVARCHAR(100) NOT NULL,
    UploadedDate DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    IsActive BIT NOT NULL DEFAULT 1,                -- Soft-delete flag
    ArchivedDate DATETIME2 NULL,                    -- When moved to archive
    RowVersion ROWVERSION NOT NULL                  -- Optimistic concurrency
);
GO

-- ============================================
-- TABLE: UpdateSchedules (deployment plans)
-- Entity: UpdateSchedule.cs | DbSet: UpdateSchedules
-- Feature 2: Deployment Scheduling
-- ============================================
CREATE TABLE UpdateSchedules (
    UpdateScheduleId INT PRIMARY KEY IDENTITY(1,1),
    UpdatePackageId INT NOT NULL,                   -- FK → UpdatePackages
    ScheduleName NVARCHAR(200) NOT NULL,            -- e.g. "LAI v4.2.1 → Line 1"
    TargetType NVARCHAR(30) NOT NULL,               -- 'All', 'ByVersion', 'ByLine', 'SelectedMCs'
    TargetFilter NVARCHAR(MAX) NULL,                -- JSON: {"version":"3.5"} or {"lineNumbers":[1,2]} or {"mcIds":[1,2,3]}
    ScheduleType NVARCHAR(20) NOT NULL,             -- 'Immediate' or 'Scheduled'
    ScheduledTimeUtc DATETIME2 NULL,                -- For scheduled deployments
    Status NVARCHAR(20) NOT NULL DEFAULT 'Pending', -- Pending → Dispatching → InProgress → Completed/PartiallyCompleted/Cancelled
    TotalTargetCount INT NOT NULL DEFAULT 0,        -- Snapshot of resolved MC count at creation
    CreatedBy NVARCHAR(100) NOT NULL,
    CreatedDateUtc DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    DispatchedDateUtc DATETIME2 NULL,
    CompletedDateUtc DATETIME2 NULL,
    CancelledBy NVARCHAR(100) NULL,
    CancelledDateUtc DATETIME2 NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    RowVersion ROWVERSION NOT NULL,                 -- Optimistic concurrency
    CONSTRAINT FK_UpdateSchedules_UpdatePackages FOREIGN KEY (UpdatePackageId)
        REFERENCES UpdatePackages(UpdatePackageId)
);
GO

-- ============================================
-- TABLE: UpdateDeployments (per-MC deployment records)
-- Entity: UpdateDeployment.cs | DbSet: UpdateDeployments
-- Feature 2: Deployment Scheduling
-- ============================================
CREATE TABLE UpdateDeployments (
    UpdateDeploymentId INT PRIMARY KEY IDENTITY(1,1),
    UpdateScheduleId INT NOT NULL,                  -- FK → UpdateSchedules
    MCId INT NOT NULL,                              -- FK → FactoryMCs
    AgentCommandId INT NULL,                        -- FK → AgentCommands (set on dispatch)
    Status NVARCHAR(20) NOT NULL DEFAULT 'Queued',  -- Queued → Dispatched → Downloading → Installing → Completed/Failed/Cancelled/Skipped
    AttemptCount INT NOT NULL DEFAULT 0,
    MaxAttempts INT NOT NULL DEFAULT 3,
    PreviousVersion NVARCHAR(50) NULL,              -- MC's version before update (for rollback)
    StartedDateUtc DATETIME2 NULL,
    CompletedDateUtc DATETIME2 NULL,
    ErrorMessage NVARCHAR(2000) NULL,
    RowVersion ROWVERSION NOT NULL,                 -- Optimistic concurrency
    CONSTRAINT FK_UpdateDeployments_UpdateSchedules FOREIGN KEY (UpdateScheduleId)
        REFERENCES UpdateSchedules(UpdateScheduleId),
    CONSTRAINT FK_UpdateDeployments_FactoryMCs FOREIGN KEY (MCId)
        REFERENCES FactoryMCs(MCId),
    CONSTRAINT FK_UpdateDeployments_AgentCommands FOREIGN KEY (AgentCommandId)
        REFERENCES AgentCommands(CommandId),
    CONSTRAINT UQ_UpdateDeployments_ScheduleMC UNIQUE (UpdateScheduleId, MCId)
);
GO

-- ============================================
-- TABLE: UpdateSettings (global settings)
-- Entity: UpdateSetting.cs | DbSet: UpdateSettings
-- Feature: Archive Auto-Purge Configuration
-- ============================================
CREATE TABLE UpdateSettings (
    SettingKey NVARCHAR(100) PRIMARY KEY,
    SettingValue NVARCHAR(500) NOT NULL,
    Description NVARCHAR(500) NULL,
    LastModified DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);
GO

PRINT '--- All 15 tables created ---';
GO


-- ==============================================================
-- SECTION 3: CREATE ALL INDEXES
-- (Matches EF DbContext OnModelCreating configuration)
-- ==============================================================

-- FactoryMCs indexes (from EF config)
CREATE INDEX IX_FactoryMCs_LineNumber ON FactoryMCs(LineNumber);
CREATE INDEX IX_FactoryMCs_IsOnline ON FactoryMCs(IsOnline);
GO

-- ConfigFiles indexes (from EF config)
CREATE INDEX IX_ConfigFiles_PendingUpdate ON ConfigFiles(PendingUpdate);
GO

-- AgentCommands indexes (from EF config)
CREATE INDEX IX_AgentCommands_MCId_Status ON AgentCommands(MCId, Status);
GO

-- ModelDistributions indexes (from EF config)
CREATE INDEX IX_ModelDistributions_Status ON ModelDistributions(Status);
GO

-- YieldRecords indexes (from EF config)
CREATE INDEX IX_YieldRecords_MachineId_Date ON YieldRecords(MachineId, Date);
GO

-- ModelVersions indexes (from EF config - unique)
CREATE UNIQUE INDEX IX_ModelVersions_ModelFileId_VersionNumber ON ModelVersions(ModelFileId, VersionNumber);
GO

-- YieldAlerts indexes (for query performance)
CREATE INDEX IX_YieldAlerts_MachineId_IsActive ON YieldAlerts(MachineId, IsActive);
CREATE INDEX IX_YieldAlerts_CreatedAt ON YieldAlerts(CreatedAt);
GO

-- UpdatePackages indexes (Feature 1 - unique active package per type+version)
CREATE UNIQUE INDEX IX_UpdatePackages_Type_Version_Active
    ON UpdatePackages(PackageType, Version)
    WHERE [IsActive] = 1;
GO

-- UpdateSchedules indexes (Feature 2)
CREATE INDEX IX_UpdateSchedules_Status ON UpdateSchedules(Status);
CREATE INDEX IX_UpdateSchedules_PackageId ON UpdateSchedules(UpdatePackageId);
CREATE INDEX IX_UpdateSchedules_ScheduleType_Status ON UpdateSchedules(ScheduleType, Status);
GO

-- UpdateDeployments indexes (Feature 2)
CREATE INDEX IX_UpdateDeployments_ScheduleId ON UpdateDeployments(UpdateScheduleId);
CREATE INDEX IX_UpdateDeployments_MCId ON UpdateDeployments(MCId);
CREATE INDEX IX_UpdateDeployments_Status ON UpdateDeployments(Status);
GO

PRINT '--- All indexes created ---';
GO


-- ==============================================================
-- SECTION 4: STORED PROCEDURES
-- ==============================================================

CREATE PROCEDURE sp_RegisterOrUpdateMC
    @LineNumber INT,
    @MCNumber INT,
    @IPAddress NVARCHAR(50),
    @ConfigFilePath NVARCHAR(500),
    @LogFolderPath NVARCHAR(500),
    @ModelFolderPath NVARCHAR(500),
    @ModelVersion NVARCHAR(20) = '3.5',
    @MCId INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    -- Lookup includes ModelVersion to support multiple versions for same Line/MC
    SELECT @MCId = MCId
    FROM FactoryMCs
    WHERE LineNumber = @LineNumber
      AND MCNumber = @MCNumber
      AND ModelVersion = @ModelVersion;

    IF @MCId IS NULL
    BEGIN
        INSERT INTO FactoryMCs (
            LineNumber, MCNumber, IPAddress,
            ConfigFilePath, LogFolderPath, ModelFolderPath,
            ModelVersion, IsOnline, IsApplicationRunning, LastHeartbeat
        )
        VALUES (
            @LineNumber, @MCNumber, @IPAddress,
            @ConfigFilePath, @LogFolderPath, @ModelFolderPath,
            @ModelVersion, 1, 0, GETDATE()
        );
        SET @MCId = SCOPE_IDENTITY();
    END
    ELSE
    BEGIN
        UPDATE FactoryMCs
        SET IPAddress = @IPAddress,
            ConfigFilePath = @ConfigFilePath,
            LogFolderPath = @LogFolderPath,
            ModelFolderPath = @ModelFolderPath,
            ModelVersion = @ModelVersion,
            IsOnline = 1,
            LastHeartbeat = GETDATE(),
            LastUpdated = GETDATE()
        WHERE MCId = @MCId;
    END
END
GO

PRINT '--- Stored procedures created ---';
GO

-- ==============================================================
-- SECTION 5: SEED DATA
-- ==============================================================

-- Default Update Manager settings
INSERT INTO UpdateSettings (SettingKey, SettingValue, Description, LastModified) VALUES
    ('RetentionDays', '30', 'Days to keep archived packages before auto-purge', GETUTCDATE()),
    ('MaxConcurrentDownloads', '10', 'Max agents downloading simultaneously (0 = paused)', GETUTCDATE());
GO

PRINT '--- Seed data inserted ---';
GO

PRINT '';
PRINT '====================================================';
PRINT '  DATABASE SETUP COMPLETE';
PRINT '  Tables: 15 | Indexes: 17 | Stored Procedures: 1';
PRINT '====================================================';
GO
