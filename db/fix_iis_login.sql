-- ============================================
-- FIX: Grant IIS App Pool access to FactoryMonitoringDB
-- Run this in SSMS connected as admin (sa or Windows admin)
-- ============================================

USE master;
GO

-- Create the SQL Server login for the IIS App Pool identity (if it doesn't exist)
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'IIS APPPOOL\FactoryMonitoring')
BEGIN
    CREATE LOGIN [IIS APPPOOL\FactoryMonitoring] FROM WINDOWS;
    PRINT 'Login created for IIS APPPOOL\FactoryMonitoring';
END
ELSE
    PRINT 'Login already exists for IIS APPPOOL\FactoryMonitoring';
GO

-- Now map it to the database and give it full access
USE FactoryMonitoringDB;
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'IIS APPPOOL\FactoryMonitoring')
BEGIN
    CREATE USER [IIS APPPOOL\FactoryMonitoring] FOR LOGIN [IIS APPPOOL\FactoryMonitoring];
    PRINT 'Database user created';
END
GO

ALTER ROLE db_owner ADD MEMBER [IIS APPPOOL\FactoryMonitoring];
GO

PRINT 'IIS APPPOOL\FactoryMonitoring now has db_owner access to FactoryMonitoringDB';
PRINT 'Recycle the IIS App Pool and try again!';
