-- ============================================================
-- Migration: Add Config Drift Detection columns to FactoryMCs
-- Run this against your SQL Server database
-- ============================================================

-- Add ConfigHash (current hash from agent heartbeat)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('FactoryMCs') AND name = 'ConfigHash')
BEGIN
    ALTER TABLE FactoryMCs ADD ConfigHash NVARCHAR(128) NULL;
    PRINT 'Added ConfigHash column';
END

-- Add InitialConfigHash (baseline hash set on first heartbeat)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('FactoryMCs') AND name = 'InitialConfigHash')
BEGIN
    ALTER TABLE FactoryMCs ADD InitialConfigHash NVARCHAR(128) NULL;
    PRINT 'Added InitialConfigHash column';
END

-- Add ConfigDriftDetected (flag: true when config changed from baseline)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('FactoryMCs') AND name = 'ConfigDriftDetected')
BEGIN
    ALTER TABLE FactoryMCs ADD ConfigDriftDetected BIT NOT NULL DEFAULT 0;
    PRINT 'Added ConfigDriftDetected column';
END

PRINT 'Migration complete.';
