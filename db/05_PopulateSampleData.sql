USE FactoryMonitoringDB;
GO

PRINT 'Populating sample data...';

-- Add sample factory PCs if they don't exist
IF NOT EXISTS (SELECT 1 FROM FactoryMCs)
BEGIN
    INSERT INTO FactoryMCs (LineNumber, MCNumber, IPAddress, ConfigFilePath, LogFolderPath, ModelFolderPath, ModelVersion, IsOnline, IsApplicationRunning, LastHeartbeat, LogStructureJson)
    VALUES 
        (1, 1, '192.168.1.101', 'C:\Factory\Line1\PC1\config.ini', 'C:\Factory\Line1\PC1\logs', 'C:\Factory\Line1\PC1\models', '3.5', 1, 1, GETDATE(), NULL),
        (1, 2, '192.168.1.102', 'C:\Factory\Line1\PC2\config.ini', 'C:\Factory\Line1\PC2\logs', 'C:\Factory\Line1\PC2\models', '3.5', 1, 0, GETDATE(), NULL),
        (1, 3, '192.168.1.103', 'C:\Factory\Line1\PC3\config.ini', 'C:\Factory\Line1\PC3\logs', 'C:\Factory\Line1\PC3\models', '3.5', 0, 0, DATEADD(MINUTE, -5, GETDATE()), NULL),
        
        (2, 1, '192.168.2.101', 'C:\Factory\Line2\PC1\config.ini', 'C:\Factory\Line2\PC1\logs', 'C:\Factory\Line2\PC1\models', '4.0', 1, 1, GETDATE(), NULL),
        (2, 2, '192.168.2.102', 'C:\Factory\Line2\PC2\config.ini', 'C:\Factory\Line2\PC2\logs', 'C:\Factory\Line2\PC2\models', '4.0', 1, 1, GETDATE(), NULL),
        (2, 3, '192.168.2.103', 'C:\Factory\Line2\PC3\config.ini', 'C:\Factory\Line2\PC3\logs', 'C:\Factory\Line2\PC3\models', '4.0', 1, 0, GETDATE(), NULL),
        
        (3, 1, '192.168.3.101', 'C:\Factory\Line3\PC1\config.ini', 'C:\Factory\Line3\PC1\logs', 'C:\Factory\Line3\PC1\models', '3.5', 0, 0, DATEADD(HOUR, -1, GETDATE()), NULL),
        (3, 2, '192.168.3.102', 'C:\Factory\Line3\PC2\config.ini', 'C:\Factory\Line3\PC2\logs', 'C:\Factory\Line3\PC2\models', '4.0', 1, 1, GETDATE(), NULL);
    
    PRINT 'Sample MCs added successfully!';
END
ELSE
BEGIN
    PRINT 'FactoryMCs table already has data.';
END
GO

-- Add sample config files for each PC
DECLARE @MCId INT;
DECLARE pc_cursor CURSOR FOR SELECT MCId FROM FactoryMCs WHERE NOT EXISTS (SELECT 1 FROM ConfigFiles WHERE ConfigFiles.MCId = FactoryMCs.MCId);

OPEN pc_cursor;
FETCH NEXT FROM pc_cursor INTO @MCId;

WHILE @@FETCH_STATUS = 0
BEGIN
    INSERT INTO ConfigFiles (MCId, ConfigContent, LastModified)
    VALUES (@MCId, 
        '[Application]
AppName=FactoryMonitor
Version=1.0
LogLevel=Info

[Camera]
Resolution=1920x1080
FPS=30
AutoExposure=True

[Processing]
Threads=4
BatchSize=10
Timeout=5000

[Server]
ServerURL=http://localhost:5000
HeartbeatInterval=10000
',
        GETDATE());
    
    FETCH NEXT FROM pc_cursor INTO @MCId;
END;

CLOSE pc_cursor;
DEALLOCATE pc_cursor;
PRINT 'Sample config files added!';
GO

-- Add sample models for each PC
DECLARE @MCId_Model INT;
DECLARE @ModelVersion NVARCHAR(20);
DECLARE pc_cursor_model CURSOR FOR 
    SELECT MCId, ModelVersion FROM FactoryMCs 
    WHERE NOT EXISTS (SELECT 1 FROM Models WHERE Models.MCId = FactoryMCs.MCId);

OPEN pc_cursor_model;
FETCH NEXT FROM pc_cursor_model INTO @MCId_Model, @ModelVersion;

WHILE @@FETCH_STATUS = 0
BEGIN
    -- Add 2-3 models per PC
    INSERT INTO Models (MCId, ModelName, ModelPath, IsCurrentModel, DiscoveredDate, LastUsed)
    VALUES 
        (@MCId_Model, 'DefectDetection_v1.0', 'C:\Models\DefectDetection_v1.0', 0, DATEADD(DAY, -30, GETDATE()), DATEADD(DAY, -15, GETDATE())),
        (@MCId_Model, 'QualityCheck_v2.5', 'C:\Models\QualityCheck_v2.5', 1, DATEADD(DAY, -10, GETDATE()), GETDATE()),
        (@MCId_Model, 'Assembly_v1.5', 'C:\Models\Assembly_v1.5', 0, DATEADD(DAY, -20, GETDATE()), DATEADD(DAY, -5, GETDATE()));
    
    FETCH NEXT FROM pc_cursor_model INTO @MCId_Model, @ModelVersion;
END;

CLOSE pc_cursor_model;
DEALLOCATE pc_cursor_model;
PRINT 'Sample models added!';
GO

-- Populate LineTargetModels based on existing data
-- This logic determines the "Target" model based on the most common current model for that Line and Version
IF NOT EXISTS (SELECT 1 FROM LineTargetModels)
BEGIN
    INSERT INTO LineTargetModels (LineNumber, ModelVersion, TargetModelName, SetByUser, Notes)
    SELECT 
        fp.LineNumber,
        fp.ModelVersion,
        ISNULL(
            (SELECT TOP 1 m.ModelName 
             FROM Models m 
             WHERE m.MCId IN (SELECT MCId FROM FactoryMCs WHERE LineNumber = fp.LineNumber AND ModelVersion = fp.ModelVersion)
               AND m.IsCurrentModel = 1
             GROUP BY m.ModelName 
             ORDER BY COUNT(*) DESC),
            'Not Set'
        ) AS TargetModelName,
        'System',
        'Auto-populated from most common current model'
    FROM FactoryMCs fp
    GROUP BY fp.LineNumber, fp.ModelVersion
    ORDER BY fp.LineNumber, fp.ModelVersion;
    
    PRINT 'LineTargetModels table populated!';
END
GO

PRINT '==============================================';
PRINT 'Sample data setup complete!';
PRINT '==============================================';
GO
