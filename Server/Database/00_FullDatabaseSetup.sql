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
BEGIN TRY
    IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'IIS APPPOOL\LensAssemblyMonitoring')
    BEGIN
        EXEC('CREATE LOGIN [IIS APPPOOL\LensAssemblyMonitoring] FROM WINDOWS');
        PRINT 'Login created for IIS APPPOOL\LensAssemblyMonitoring';
    END

    IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'IIS APPPOOL\LensAssemblyMonitoring')
    BEGIN
        EXEC('CREATE USER [IIS APPPOOL\LensAssemblyMonitoring] FOR LOGIN [IIS APPPOOL\LensAssemblyMonitoring]');
    END

    EXEC('ALTER ROLE db_owner ADD MEMBER [IIS APPPOOL\LensAssemblyMonitoring]');
    
    PRINT '--- Database and IIS login created ---';
END TRY
BEGIN CATCH
    PRINT '--- NOTE: IIS App Pool login skipped. This is normal for local development. ---';
    PRINT ERROR_MESSAGE();
END CATCH
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
    GenerationNo NVARCHAR(20) NOT NULL DEFAULT '3.5',
    IsApplicationRunning BIT NOT NULL DEFAULT 0,
    IsOnline BIT NOT NULL DEFAULT 0,
    LastHeartbeat DATETIME NULL,
    RegisteredDate DATETIME NOT NULL DEFAULT GETDATE(),
    LastUpdated DATETIME NOT NULL DEFAULT GETDATE(),
    LifecycleState NVARCHAR(30) NOT NULL DEFAULT 'Active',
    LifecycleRequestedAtUtc DATETIME2 NULL,
    LifecycleCompletedAtUtc DATETIME2 NULL,
    LifecycleCommandId INT NULL,
    LifecycleError NVARCHAR(1000) NULL,
    -- Component version tracking
    AgentVersion       NVARCHAR(50) NULL,
    ServiceVersion     NVARCHAR(50) NULL,
    AutoUpdaterVersion NVARCHAR(50) NULL,
    LAIVersion         NVARCHAR(50) NULL,
    -- Diagnostics fields (updated every 60s via /api/agent/diagnostics)
    MemoryMB           INT NULL,                    -- Agent working set in MB
    UptimeMinutes      INT NULL,                    -- Agent uptime in minutes
    ErrorCount         INT NULL,                    -- Errors since agent startup
    ThreadCount        INT NULL,                    -- Agent thread count
    LastDiagnostics    DATETIME NULL                -- Last diagnostics report timestamp
);
GO



-- ============================================
-- TABLE: MCLogStructures
-- Offloads massive JSON log structures from main MC table
-- ============================================
CREATE TABLE MCLogStructures (
    MCId INT PRIMARY KEY,
    LogStructureJson NVARCHAR(MAX) NULL,
    CONSTRAINT FK_MCLogStructures_LensAssemblyMCs FOREIGN KEY (MCId)
        REFERENCES LensAssemblyMCs(MCId) ON DELETE CASCADE
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
-- ============================================
CREATE TABLE ModelFiles (
    ModelFileId INT PRIMARY KEY IDENTITY(1,1),
    ModelName NVARCHAR(255) NOT NULL,
    StoragePath NVARCHAR(500) NOT NULL,       -- Relative path to file on disk e.g. "models/42/v1.zip"
    FileName NVARCHAR(255) NOT NULL,
    FileSize BIGINT NOT NULL,
    Checksum NVARCHAR(64) NOT NULL,            -- SHA-256 hex string for integrity verification
    ContentHash NVARCHAR(64) NOT NULL,         -- SHA-256 for deduplication (same content = same hash)
    UploadedDate DATETIME NOT NULL DEFAULT GETDATE(),
    UploadedBy NVARCHAR(100) NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    IsTemplate BIT NOT NULL DEFAULT 0,
    IsDefaultTemplate BIT NOT NULL DEFAULT 0,     -- Global default model template for new line model creation
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
    GenerationNo NVARCHAR(20) NOT NULL DEFAULT '3.5',
    TargetModelName NVARCHAR(255) NOT NULL,
    SetByUser NVARCHAR(100) NULL,
    SetDate DATETIME NOT NULL DEFAULT GETDATE(),
    LastUpdated DATETIME NOT NULL DEFAULT GETDATE(),
    Notes NVARCHAR(500) NULL,
    CONSTRAINT UC_LineNumber_Version UNIQUE(LineNumber, GenerationNo)
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
-- TABLE: GenerationNos (version history for library models)
-- Entity: GenerationNo.cs | DbSet: GenerationNos
-- ============================================
CREATE TABLE GenerationNos (
    GenerationNoId INT PRIMARY KEY IDENTITY(1,1),
    ModelFileId INT NOT NULL,
    VersionNumber INT NOT NULL,
    StoragePath NVARCHAR(500) NOT NULL,       -- Relative path e.g. "models/42/v3.zip"
    Checksum NVARCHAR(64) NOT NULL,            -- SHA-256 hex string
    FileSize BIGINT NOT NULL DEFAULT 0,
    CreatedDate DATETIME NOT NULL DEFAULT GETDATE(),
    CreatedBy NVARCHAR(100) NULL,
    ChangeSummary NVARCHAR(500) NULL,
    CONSTRAINT FK_GenerationNos_ModelFiles FOREIGN KEY (ModelFileId)
        REFERENCES ModelFiles(ModelFileId) ON DELETE CASCADE
);
GO

-- ============================================
-- TABLE: UpdatePackages (metadata-only package registry)
-- Entity: UpdatePackage.cs | DbSet: UpdatePackages
-- Feature 1: Software Library — scanned from shared network paths
-- No binary files are stored on the web server.
-- ============================================
CREATE TABLE UpdatePackages (
    UpdatePackageId INT PRIMARY KEY IDENTITY(1,1),
    PackageType NVARCHAR(20) NOT NULL,              -- 'Bundle' or 'LAI'
    Version NVARCHAR(50) NOT NULL,
    FileName NVARCHAR(500) NOT NULL,                -- Package filename from release-info.json (e.g. bundle.zip, lai.zip)
    StoragePath NVARCHAR(1000) NOT NULL,            -- UNC shared network path (e.g. \\server\share\Release_v4.0)
    FileSize BIGINT NOT NULL,
    FileHash NVARCHAR(128) NOT NULL,                -- SHA-256 hash computed during scan
    Description NVARCHAR(2000) NULL,                -- Release notes from release-info.json
    UploadedBy NVARCHAR(100) NOT NULL,              -- Who registered the package (operator name)
    UploadedDate DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    ShareUsername NVARCHAR(200) NULL,                -- Network share username (e.g. domain\user)
    SharePasswordEncrypted NVARCHAR(500) NULL,       -- AES-256 encrypted password for network share
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

-- ============================================
-- TABLE: LineBarrelConfigs
-- Barrel assembly configuration per line model
-- ============================================
CREATE TABLE LineBarrelConfigs (
    Id INT PRIMARY KEY IDENTITY(1,1),
    LineNumber INT NOT NULL,
    Version NVARCHAR(20) NOT NULL DEFAULT '3.5',
    ModelName NVARCHAR(255) NOT NULL,
    LensCount INT NOT NULL DEFAULT 0,
    SpacerCount INT NOT NULL DEFAULT 0,
    AssemblySequence NVARCHAR(MAX) NULL,           -- JSON array: ["SP0","L1","L2",...]
    StepParamsJson NVARCHAR(MAX) NULL,             -- JSON: Step inner diameters and heights
    ComponentParamsJson NVARCHAR(MAX) NULL,        -- JSON: Specific component settings
    BarrelSlotsJson NVARCHAR(MAX) NULL,            -- JSON: Exact drag-and-drop state
    TTL DECIMAL(10,4) NULL,                        -- Total barrel length (mm)
    TrayDimX INT NULL,                             -- Barrel tray X dimension
    TrayDimY INT NULL,                             -- Barrel tray Y dimension
    MachineCount INT NOT NULL DEFAULT 0,           -- User-specified machine count for this model
    CreatedDate DATETIME NOT NULL DEFAULT GETDATE(),
    ModifiedDate DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT UC_LineBarrelConfig UNIQUE(LineNumber, Version, ModelName)
);
GO

-- ============================================
-- TABLE: MachinePickerConfigs
-- Per-machine picker assignment for a line model
-- ============================================
CREATE TABLE MachinePickerConfigs (
    Id INT PRIMARY KEY IDENTITY(1,1),
    LineNumber INT NOT NULL,
    Version NVARCHAR(20) NOT NULL DEFAULT '3.5',
    ModelName NVARCHAR(255) NOT NULL,
    McNumber INT NOT NULL,
    Picker1Enabled BIT NOT NULL DEFAULT 1,
    Picker1Type NVARCHAR(20) NULL,                 -- 'Lens' | 'Spacer' | 'Cap'
    Picker1Position NVARCHAR(20) NULL,              -- 'L1' | 'SP0' | 'Ring' etc.
    Picker1Params NVARCHAR(MAX) NULL,               -- JSON blob for base params
    Picker2Enabled BIT NOT NULL DEFAULT 0,
    Picker2Type NVARCHAR(20) NULL,
    Picker2Position NVARCHAR(20) NULL,
    Picker2Params NVARCHAR(MAX) NULL,
    CreatedDate DATETIME NOT NULL DEFAULT GETDATE(),
    ModifiedDate DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT UC_MachinePickerConfig UNIQUE(LineNumber, Version, ModelName, McNumber)
);
GO

-- ============================================
-- TABLE: ModelSyncHistories
-- Tracks when models were synced from machines
-- ============================================
CREATE TABLE ModelSyncHistories (
    Id INT PRIMARY KEY IDENTITY(1,1),
    LineNumber INT NOT NULL,
    Version NVARCHAR(20) NOT NULL DEFAULT '3.5',
    ModelName NVARCHAR(255) NOT NULL,
    SyncedDate DATETIME NOT NULL DEFAULT GETDATE(),
    SyncedFromMcIds NVARCHAR(MAX) NULL,             -- JSON array of MC IDs
    Status NVARCHAR(20) NOT NULL DEFAULT 'Success', -- Success | Partial | Failed
    Details NVARCHAR(MAX) NULL                      -- JSON: error details per MC
);
GO

-- ============================================
-- TABLE: LineDeploymentHistories
-- Tracks model deployments per line
-- ============================================
CREATE TABLE LineDeploymentHistories (
    Id INT PRIMARY KEY IDENTITY(1,1),
    LineNumber INT NOT NULL,
    Version NVARCHAR(20) NOT NULL DEFAULT '3.5',
    ModelName NVARCHAR(255) NOT NULL,
    DeployedDate DATETIME NOT NULL DEFAULT GETDATE(),
    DeployedBy NVARCHAR(100) NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Pending', -- Pending | InProgress | Success | Failed | RolledBack
    MachineCount INT NOT NULL DEFAULT 0,
    Details NVARCHAR(MAX) NULL                      -- JSON: per-machine results
);
GO

-- ============================================
-- TABLE: LineModelMachineFiles
-- Per-machine model file mapping for a line model
-- ============================================
CREATE TABLE LineModelMachineFiles (
    Id INT PRIMARY KEY IDENTITY(1,1),
    LineNumber INT NOT NULL,
    Version NVARCHAR(20) NOT NULL DEFAULT '3.5',
    ModelName NVARCHAR(255) NOT NULL,
    McNumber INT NOT NULL,
    ModelFileId INT NULL,                          -- FK → ModelFiles (base model copy)
    DerivedParams NVARCHAR(MAX) NULL,              -- JSON: derived spec params (Phase 2)
    Status NVARCHAR(20) NOT NULL DEFAULT 'Pending', -- Pending | Derived | Deployed
    CreatedDate DATETIME NOT NULL DEFAULT GETDATE(),
    ModifiedDate DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_LMMF_ModelFiles FOREIGN KEY (ModelFileId)
        REFERENCES ModelFiles(ModelFileId) ON DELETE SET NULL,
    CONSTRAINT UC_LineModelMachineFile UNIQUE(LineNumber, Version, ModelName, McNumber)
);
GO

PRINT '--- All 18 tables created ---';
GO


-- ==============================================================
-- SECTION 3: CREATE ALL INDEXES
-- (Matches EF DbContext OnModelCreating configuration)
-- ==============================================================

-- LensAssemblyMCs indexes (from EF config)
CREATE UNIQUE INDEX IX_LensAssemblyMCs_IPAddress
    ON LensAssemblyMCs(IPAddress)
    WHERE [LifecycleState] <> 'Decommissioned';
CREATE UNIQUE INDEX IX_LensAssemblyMCs_LineNumber_MCNumber_GenerationNo
    ON LensAssemblyMCs(LineNumber, MCNumber, GenerationNo)
    WHERE [LifecycleState] <> 'Decommissioned';
CREATE INDEX IX_LensAssemblyMCs_LineNumber ON LensAssemblyMCs(LineNumber);
CREATE INDEX IX_LensAssemblyMCs_IsOnline ON LensAssemblyMCs(IsOnline);
CREATE INDEX IX_LensAssemblyMCs_LifecycleState ON LensAssemblyMCs(LifecycleState);
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

-- GenerationNos indexes (from EF config - unique)
CREATE UNIQUE INDEX IX_GenerationNos_ModelFileId_VersionNumber ON GenerationNos(ModelFileId, VersionNumber);
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

-- LineBarrelConfigs indexes (Model Management)
CREATE INDEX IX_LineBarrelConfigs_Line_Version ON LineBarrelConfigs(LineNumber, Version);
GO

-- MachinePickerConfigs indexes (Model Management)
CREATE INDEX IX_MachinePickerConfigs_Line_Version_Model ON MachinePickerConfigs(LineNumber, Version, ModelName);
GO

-- ModelSyncHistories indexes (Model Management)
CREATE INDEX IX_ModelSyncHistories_Line_Model ON ModelSyncHistories(LineNumber, ModelName);
GO

-- LineDeploymentHistories indexes (Model Management)
CREATE INDEX IX_LineDeploymentHistories_Line ON LineDeploymentHistories(LineNumber, Version);
GO

-- LineModelMachineFiles indexes (Model Management)
CREATE INDEX IX_LineModelMachineFiles_Line_Model ON LineModelMachineFiles(LineNumber, Version, ModelName);
GO

PRINT '--- All indexes created ---';
GO


PRINT '';
PRINT '====================================================';
PRINT '  DATABASE SETUP COMPLETE';
PRINT '  Tables: 18 | Indexes: 24';
PRINT '  NOTE: Model binaries stored on disk, not in DB.';
PRINT '  Configure StorageRoot in appsettings.json.';
PRINT '====================================================';
GO
