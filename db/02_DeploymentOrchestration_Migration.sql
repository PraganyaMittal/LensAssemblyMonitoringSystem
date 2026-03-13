-- ==============================================================
-- Migration: Deployment Orchestration & Health Monitoring
-- Adds: component version tracking, IPC health, orchestration
--        fields, LAIReleases table
-- ==============================================================

USE FactoryMonitoringDB;
GO

-- ==============================================================
-- 1. FactoryMCs: Add component version & IPC health columns
-- ==============================================================
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('FactoryMCs') AND name = 'AgentVersion')
BEGIN
    ALTER TABLE FactoryMCs ADD
        AgentVersion       NVARCHAR(50) NULL,
        ServiceVersion     NVARCHAR(50) NULL,
        AutoUpdaterVersion NVARCHAR(50) NULL,
        LAIVersion         NVARCHAR(50) NULL,
        IpcConnected       BIT NOT NULL DEFAULT 0,
        IpcLastPingMs      INT NULL;

    PRINT '  Added version + IPC columns to FactoryMCs';
END
GO

-- ==============================================================
-- 2. UpdateSchedules: Add orchestration fields
-- ==============================================================
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('UpdateSchedules') AND name = 'OriginalScheduleId')
BEGIN
    ALTER TABLE UpdateSchedules ADD
        OriginalScheduleId INT NULL,
        IsRollback         BIT NOT NULL DEFAULT 0,
        HaltReason         NVARCHAR(2000) NULL,
        HaltedAtMCId       INT NULL;

    PRINT '  Added orchestration columns to UpdateSchedules';
END
GO

-- Add FK: OriginalScheduleId → self-referencing
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_UpdateSchedules_Original')
BEGIN
    ALTER TABLE UpdateSchedules ADD CONSTRAINT FK_UpdateSchedules_Original
        FOREIGN KEY (OriginalScheduleId) REFERENCES UpdateSchedules(UpdateScheduleId);

    PRINT '  Added FK_UpdateSchedules_Original';
END
GO

-- Add FK: HaltedAtMCId → FactoryMCs
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_UpdateSchedules_HaltedAtMC')
BEGIN
    ALTER TABLE UpdateSchedules ADD CONSTRAINT FK_UpdateSchedules_HaltedAtMC
        FOREIGN KEY (HaltedAtMCId) REFERENCES FactoryMCs(MCId)
        ON DELETE SET NULL;

    PRINT '  Added FK_UpdateSchedules_HaltedAtMC';
END
GO

-- ==============================================================
-- 3. UpdateDeployments: Add execution order & reported versions
-- ==============================================================
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('UpdateDeployments') AND name = 'ExecutionOrder')
BEGIN
    ALTER TABLE UpdateDeployments ADD
        ExecutionOrder          INT NOT NULL DEFAULT 0,
        ReportedAgentVersion    NVARCHAR(50) NULL,
        ReportedServiceVersion  NVARCHAR(50) NULL,
        ReportedUpdaterVersion  NVARCHAR(50) NULL;

    PRINT '  Added orchestration columns to UpdateDeployments';
END
GO

-- ==============================================================
-- 4. LAIReleases: New table for LAI version metadata
-- ==============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'LAIReleases')
BEGIN
    CREATE TABLE LAIReleases (
        LAIReleaseId     INT PRIMARY KEY IDENTITY(1,1),
        Version          NVARCHAR(50) NOT NULL,
        SharedPath       NVARCHAR(1000) NOT NULL,
        PackageName      NVARCHAR(200) NOT NULL,
        ReleaseNotes     NVARCHAR(MAX) NULL,
        TargetLineNumber INT NOT NULL,
        RegisteredBy     NVARCHAR(100) NOT NULL,
        RegisteredDateUtc DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        Status           NVARCHAR(20) NOT NULL DEFAULT 'Registered',
        CompletedDateUtc DATETIME2 NULL,
        ErrorMessage     NVARCHAR(2000) NULL,
        CONSTRAINT UQ_LAI_Version_Line UNIQUE(Version, TargetLineNumber)
    );

    -- Indexes
    CREATE INDEX IX_LAIReleases_TargetLine ON LAIReleases(TargetLineNumber);
    CREATE INDEX IX_LAIReleases_Status ON LAIReleases(Status);

    PRINT '  Created LAIReleases table';
END
GO

PRINT '';
PRINT '====================================================';
PRINT '  MIGRATION COMPLETE';
PRINT '  FactoryMCs: +6 columns (versions + IPC)';
PRINT '  UpdateSchedules: +4 columns (orchestration)';
PRINT '  UpdateDeployments: +4 columns (order + versions)';
PRINT '  LAIReleases: new table';
PRINT '====================================================';
GO
