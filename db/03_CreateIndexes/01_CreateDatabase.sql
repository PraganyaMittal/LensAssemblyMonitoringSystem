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

PRINT 'Database FactoryMonitoringDB created successfully!';