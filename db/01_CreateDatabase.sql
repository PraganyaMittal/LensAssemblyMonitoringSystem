USE master;
GO

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

-- Grant IIS App Pool access to the new database
-- This is needed because DROP DATABASE removes all user mappings
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

PRINT 'Database FactoryMonitoringDB created successfully!';
PRINT 'IIS APPPOOL\FactoryMonitoring granted db_owner access.';