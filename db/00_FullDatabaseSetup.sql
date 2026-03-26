-- ==============================================================
-- Factory Monitoring Database - Complete Setup Script
-- Generated from C# entity models + EF DbContext configuration
-- Run this script in SQL Server Management Studio (SSMS)
-- ==============================================================

USE master;
GO

SET QUOTED_IDENTIFIER ON;
GO

-- Drop existing database if it exists (CAUTION: destroys all data)
IF EXISTS (SELECT name FROM sys.databases WHERE name = 'LensAssemblyMonitoringDB')
BEGIN
    ALTER DATABASE LensAssemblyMonitoringDB SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE LensAssemblyMonitoringDB;
END
GO

CREATE DATABASE LensAssemblyMonitoringDB;
GO

USE LensAssemblyMonitoringDB;
GO

-- ==============================================================
-- SECTION 1: IIS App Pool Login
-- ==============================================================
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'IIS APPPOOL\LensAssemblyMonitoring')
BEGIN
    EXEC('CREATE LOGIN [IIS APPPOOL\LensAssemblyMonitoring] FROM WINDOWS');
    PRINT 'Login created for IIS APPPOOL\LensAssemblyMonitoring';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'IIS APPPOOL\LensAssemblyMonitoring')
BEGIN
    CREATE USER [IIS APPPOOL\LensAssemblyMonitoring] FOR LOGIN [IIS APPPOOL\LensAssemblyMonitoring];
END
GO

ALTER ROLE db_owner ADD MEMBER [IIS APPPOOL\LensAssemblyMonitoring];
GO

PRINT '--- Database and IIS login created ---';
GO

-- ==============================================================
-- SECTION 2: CREATE ALL TABLES
-- ==============================================================

-- ============================================
-- TABLE: LensAssemblyMCs (root table, no FKs)
-- Entity: LensAssemblyMC.cs | DbSet: LensAssemblyMCs
-- ============================================
CREATE TABLE LensAssemblyMCs (
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
    InstallDir NVARCHAR(500) NOT NULL DEFAULT 'C:\Factory_Dirs\',
    -- Component version tracking
    AgentVersion       NVARCHAR(50) NULL,
    ServiceVersion     NVARCHAR(50) NULL,
    AutoUpdaterVersion NVARCHAR(50) NULL,
    LAIVersion         NVARCHAR(50) NULL,
    -- IPC health monitoring
    IpcConnected       BIT NOT NULL DEFAULT 0,
    IpcLastPingMs      INT NULL,
    -- Diagnostics fields (updated every 60s via /api/agent/diagnostics)
    MemoryMB           INT NULL,                    -- Agent working set in MB
    UptimeMinutes      INT NULL,                    -- Agent uptime in minutes
    ErrorCount         INT NULL,                    -- Errors since agent startup
    ThreadCount        INT NULL,                    -- Agent thread count
    LastDiagnostics    DATETIME NULL,               -- Last diagnostics report timestamp
    CONSTRAINT UC_LineMC_Version UNIQUE(LineNumber, MCNumber, ModelVersion)
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
    CONSTRAINT FK_Models_LensAssemblyMCs FOREIGN KEY (MCId)
        REFERENCES LensAssemblyMCs(MCId) ON DELETE CASCADE,
    CONSTRAINT UQ_Models_MCId_ModelName UNIQUE(MCId, ModelName)
);
GO

-- ============================================
-- TABLE: ModelFiles (model library / uploaded ZIPs)
-- Entity: ModelFile.cs | DbSet: ModelFiles
-- REDESIGNED: Binary data stored on disk, not in DB
-- ============================================
CREATE TABLE ModelFiles (
    ModelFileId INT PRIMARY KEY IDENTITY(1,1),
    ModelName NVARCHAR(255) NOT NULL,
    -- REMOVED: FileData VARBINARY(MAX)  (binaries now stored on disk)
    StoragePath NVARCHAR(500) NOT NULL,       -- Relative path to file on disk e.g. "models/42/v1.zip"
    FileName NVARCHAR(255) NOT NULL,
    FileSize BIGINT NOT NULL,
    Checksum NVARCHAR(64) NOT NULL,            -- SHA-256 hex string for integrity verification
    ContentHash NVARCHAR(64) NOT NULL,         -- SHA-256 for deduplication (same content = same hash)
    UploadedDate DATETIME NOT NULL DEFAULT GETDATE(),
    UploadedBy NVARCHAR(100) NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    IsTemplate BIT NOT NULL DEFAULT 0,
    Description NVARCHAR(500) NULL,
    Category NVARCHAR(100) NULL
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
    CONSTRAINT FK_AgentCommands_LensAssemblyMCs FOREIGN KEY (MCId)
        REFERENCES LensAssemblyMCs(MCId) ON DELETE CASCADE
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
    CONSTRAINT FK_SystemLogs_LensAssemblyMCs FOREIGN KEY (MCId)
        REFERENCES LensAssemblyMCs(MCId) ON DELETE SET NULL
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
    CONSTRAINT FK_YieldAlerts_LensAssemblyMCs FOREIGN KEY (MachineId)
        REFERENCES LensAssemblyMCs(MCId) ON DELETE CASCADE
);
GO

-- ============================================
-- TABLE: ModelVersions (version history for library models)
-- Entity: ModelVersion.cs | DbSet: ModelVersions
-- REDESIGNED: Binary data stored on disk, not in DB
-- ============================================
CREATE TABLE ModelVersions (
    ModelVersionId INT PRIMARY KEY IDENTITY(1,1),
    ModelFileId INT NOT NULL,
    VersionNumber INT NOT NULL,
    -- REMOVED: FileData VARBINARY(MAX)  (binaries now stored on disk)
    StoragePath NVARCHAR(500) NOT NULL,       -- Relative path e.g. "models/42/v3.zip"
    Checksum NVARCHAR(64) NOT NULL,            -- SHA-256 hex string
    FileSize BIGINT NOT NULL DEFAULT 0,
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
    PackageType NVARCHAR(20) NOT NULL,              -- 'Bundle' (zip with component folders: LAI/, LensAssemblyService/, LensAssemblyAgent/, AutoUpdater/)
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
    OriginalScheduleId INT NULL,
    IsRollback BIT NOT NULL DEFAULT 0,
    HaltReason NVARCHAR(2000) NULL,
    HaltedAtMCId INT NULL,
    RowVersion ROWVERSION NOT NULL,                 -- Optimistic concurrency
    CONSTRAINT FK_UpdateSchedules_UpdatePackages FOREIGN KEY (UpdatePackageId)
        REFERENCES UpdatePackages(UpdatePackageId),
    CONSTRAINT FK_UpdateSchedules_OriginalSchedule FOREIGN KEY (OriginalScheduleId)
        REFERENCES UpdateSchedules(UpdateScheduleId),
    CONSTRAINT FK_UpdateSchedules_HaltedAtMC FOREIGN KEY (HaltedAtMCId)
        REFERENCES LensAssemblyMCs(MCId) ON DELETE SET NULL
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
    MCId INT NOT NULL,                              -- FK → LensAssemblyMCs
    AgentCommandId INT NULL,                        -- FK → AgentCommands (set on dispatch)
    Status NVARCHAR(20) NOT NULL DEFAULT 'Queued',  -- Queued → Dispatched → Downloading → Installing → Completed/Failed/Cancelled/Skipped
    AttemptCount INT NOT NULL DEFAULT 0,
    MaxAttempts INT NOT NULL DEFAULT 3,
    PreviousVersion NVARCHAR(50) NULL,              -- MC's version before update (for rollback)
    StartedDateUtc DATETIME2 NULL,
    CompletedDateUtc DATETIME2 NULL,
    ErrorMessage NVARCHAR(2000) NULL,
    ExecutionOrder INT NOT NULL DEFAULT 0,
    ReportedAgentVersion NVARCHAR(50) NULL,
    ReportedServiceVersion NVARCHAR(50) NULL,
    ReportedUpdaterVersion NVARCHAR(50) NULL,
    RowVersion ROWVERSION NOT NULL,                 -- Optimistic concurrency
    CONSTRAINT FK_UpdateDeployments_UpdateSchedules FOREIGN KEY (UpdateScheduleId)
        REFERENCES UpdateSchedules(UpdateScheduleId),
    CONSTRAINT FK_UpdateDeployments_LensAssemblyMCs FOREIGN KEY (MCId)
        REFERENCES LensAssemblyMCs(MCId),
    CONSTRAINT FK_UpdateDeployments_AgentCommands FOREIGN KEY (AgentCommandId)
        REFERENCES AgentCommands(CommandId),
    CONSTRAINT UQ_UpdateDeployments_ScheduleMC UNIQUE (UpdateScheduleId, MCId)
);
GO

PRINT '--- All 13 tables created ---';
GO


-- ==============================================================
-- SECTION 3: CREATE ALL INDEXES
-- (Matches EF DbContext OnModelCreating configuration)
-- ==============================================================

-- LensAssemblyMCs indexes (from EF config)
CREATE INDEX IX_LensAssemblyMCs_LineNumber ON LensAssemblyMCs(LineNumber);
CREATE INDEX IX_LensAssemblyMCs_IsOnline ON LensAssemblyMCs(IsOnline);
GO


-- AgentCommands indexes (from EF config)
CREATE INDEX IX_AgentCommands_MCId_Status ON AgentCommands(MCId, Status);
GO


-- ModelFiles indexes (NEW: for deduplication and lookup)
CREATE UNIQUE INDEX IX_ModelFiles_ModelName ON ModelFiles(ModelName) WHERE IsActive = 1;
CREATE INDEX IX_ModelFiles_ContentHash ON ModelFiles(ContentHash);
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
    FROM LensAssemblyMCs
    WHERE LineNumber = @LineNumber
      AND MCNumber = @MCNumber
      AND ModelVersion = @ModelVersion;

    IF @MCId IS NULL
    BEGIN
        INSERT INTO LensAssemblyMCs (
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
        UPDATE LensAssemblyMCs
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

PRINT '';
PRINT '====================================================';
PRINT '  DATABASE SETUP COMPLETE';
PRINT '  Tables: 13 | Indexes: 17 | Stored Procedures: 1';
PRINT '  NOTE: Model binaries stored on disk, not in DB.';
PRINT '  Configure StorageRoot in appsettings.json.';
PRINT '====================================================';
GO
