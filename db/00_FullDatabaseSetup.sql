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
    CONSTRAINT FK_Models_FactoryMCs FOREIGN KEY (MCId)
        REFERENCES FactoryMCs(MCId) ON DELETE CASCADE,
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
-- TABLE: ModelDistributions (deployment tracking)
-- Entity: ModelDistribution.cs | DbSet: ModelDistributions
-- ENHANCED: Added deployment lifecycle tracking
-- ============================================
CREATE TABLE ModelDistributions (
    DistributionId INT PRIMARY KEY IDENTITY(1,1),
    ModelFileId INT NOT NULL,
    VersionNumber INT NOT NULL DEFAULT 1,          -- Which version is being deployed
    MCId INT NULL,
    LineNumber INT NULL,
    DistributionType NVARCHAR(20) NOT NULL DEFAULT 'Single',  -- 'Single', 'Line', 'All'
    Status NVARCHAR(20) NOT NULL DEFAULT 'Queued',             -- 'Queued','Downloading','Verifying','Installing','Completed','Failed'
    RequestedBy NVARCHAR(100) NULL,                -- Who initiated this deployment
    RequestedDate DATETIME NOT NULL DEFAULT GETDATE(),
    StartedDate DATETIME NULL,                     -- When agent started processing
    CompletedDate DATETIME NULL,
    ErrorMessage NVARCHAR(MAX) NULL,
    RetryCount INT NOT NULL DEFAULT 0,
    ApplyOnDownload BIT NOT NULL DEFAULT 0,
    -- Integrity verification
    ExpectedChecksum NVARCHAR(64) NULL,            -- Checksum agent should verify after download
    AgentChecksum NVARCHAR(64) NULL,               -- Checksum agent computed and reported back
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

PRINT '--- All 11 tables created ---';
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
CREATE INDEX IX_ModelDistributions_MCId ON ModelDistributions(MCId);
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

PRINT '';
PRINT '====================================================';
PRINT '  DATABASE SETUP COMPLETE';
PRINT '  Tables: 11 | Indexes: 13 | Stored Procedures: 1';
PRINT '  NOTE: Model binaries stored on disk, not in DB.';
PRINT '  Configure StorageRoot in appsettings.json.';
PRINT '====================================================';
GO
