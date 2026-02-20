USE FactoryMonitoringDB;
GO

-- ============================================
-- TABLE: YieldAlerts
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'YieldAlerts')
BEGIN
    CREATE TABLE YieldAlerts (
        Id INT PRIMARY KEY IDENTITY(1,1),
        MachineId INT NOT NULL,
        MachineName NVARCHAR(100) NOT NULL,
        LineNumber INT NOT NULL,
        CurrentYield FLOAT NOT NULL,
        Threshold FLOAT NOT NULL,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        IsActive BIT NOT NULL DEFAULT 1,
        ResolvedAt DATETIME NULL,
        IsAcknowledged BIT NOT NULL DEFAULT 0,
        AcknowledgedAt DATETIME NULL,
        DateRangeStart DATETIME NULL,
        DateRangeEnd DATETIME NULL,
        CONSTRAINT FK_YieldAlerts_FactoryMCs FOREIGN KEY (MachineId) 
            REFERENCES FactoryMCs(MCId) ON DELETE CASCADE
    );

    CREATE INDEX IX_YieldAlerts_MachineId_IsActive ON YieldAlerts(MachineId, IsActive);
    CREATE INDEX IX_YieldAlerts_CreatedAt ON YieldAlerts(CreatedAt);

    PRINT 'YieldAlerts table created successfully!';
END
ELSE
BEGIN
    PRINT 'YieldAlerts table already exists.';
END
GO
