-- Add Date Range Columns to YieldAlerts
USE FactoryMonitoringDB;
GO

IF NOT EXISTS(SELECT 1 FROM sys.columns WHERE Name = 'DateRangeStart' AND Object_ID = Object_ID('YieldAlerts'))
BEGIN
    ALTER TABLE YieldAlerts ADD DateRangeStart DATETIME NULL;
    PRINT 'Added DateRangeStart column.';
END

IF NOT EXISTS(SELECT 1 FROM sys.columns WHERE Name = 'DateRangeEnd' AND Object_ID = Object_ID('YieldAlerts'))
BEGIN
    ALTER TABLE YieldAlerts ADD DateRangeEnd DATETIME NULL;
    PRINT 'Added DateRangeEnd column.';
END
GO
