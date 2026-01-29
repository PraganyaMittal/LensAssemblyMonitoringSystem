USE FactoryMonitoringDB;
GO

-- ============================================
-- TABLE: FactoryMCs (renamed from FactoryPCs)
-- ============================================
-- Updated to include LogFolderPath (was LogFilePath) and LogStructureJson
-- Constraint updated to include ModelVersion
CREATE TABLE FactoryMCs (
    MCId INT PRIMARY KEY IDENTITY(1,1),
    LineNumber INT NOT NULL,
    MCNumber INT NOT NULL,
    IPAddress NVARCHAR(50) NOT NULL,
    ConfigFilePath NVARCHAR(500) NOT NULL,
    LogFolderPath NVARCHAR(500) NOT NULL, -- Renamed from LogFilePath
    ModelFolderPath NVARCHAR(500) NOT NULL,
    ModelVersion NVARCHAR(20) NOT NULL DEFAULT '3.5',
    IsApplicationRunning BIT DEFAULT 0,
    IsOnline BIT DEFAULT 0,
    LastHeartbeat DATETIME NULL,
    RegisteredDate DATETIME DEFAULT GETDATE(),
    LastUpdated DATETIME DEFAULT GETDATE(),
    LogStructureJson NVARCHAR(MAX) NULL, -- Added for Log Analyzer
    CONSTRAINT UC_LineMC_Version UNIQUE(LineNumber, MCNumber, ModelVersion)
);
GO

-- ============================================
-- TABLE: ConfigFiles
-- ============================================
CREATE TABLE ConfigFiles (
    ConfigId INT PRIMARY KEY IDENTITY(1,1),
    MCId INT NOT NULL,
    ConfigContent NVARCHAR(MAX) NOT NULL,
    LastModified DATETIME DEFAULT GETDATE(),
    PendingUpdate BIT DEFAULT 0,
    UpdatedContent NVARCHAR(MAX) NULL,
    UpdateRequestTime DATETIME NULL,
    UpdateApplied BIT DEFAULT 0,
    CONSTRAINT FK_ConfigFiles_FactoryMCs FOREIGN KEY (MCId) 
        REFERENCES FactoryMCs(MCId) ON DELETE CASCADE
);
GO

-- ============================================
-- TABLE: Models
-- ============================================
CREATE TABLE Models (
    ModelId INT PRIMARY KEY IDENTITY(1,1),
    MCId INT NOT NULL,
    ModelName NVARCHAR(255) NOT NULL,
    ModelPath NVARCHAR(500) NOT NULL,
    IsCurrentModel BIT DEFAULT 0,
    DiscoveredDate DATETIME DEFAULT GETDATE(),
    LastUsed DATETIME NULL,
    CONSTRAINT FK_Models_FactoryMCs FOREIGN KEY (MCId) 
        REFERENCES FactoryMCs(MCId) ON DELETE CASCADE,
    CONSTRAINT UC_Model_MC_ModelName UNIQUE(MCId, ModelName)
);
GO

-- ============================================
-- TABLE: ModelFiles
-- ============================================
-- Includes IsTemplate, Description, Category fields
CREATE TABLE ModelFiles (
    ModelFileId INT PRIMARY KEY IDENTITY(1,1),
    ModelName NVARCHAR(255) NOT NULL,
    FileData VARBINARY(MAX) NOT NULL,
    FileName NVARCHAR(255) NOT NULL,
    FileSize BIGINT NOT NULL,
    UploadedDate DATETIME DEFAULT GETDATE(),
    UploadedBy NVARCHAR(100) NULL,
    IsActive BIT DEFAULT 1,
    IsTemplate BIT NOT NULL DEFAULT 0,
    Description NVARCHAR(500) NULL,
    Category NVARCHAR(100) NULL
);
GO

-- ============================================
-- TABLE: LineTargetModels
-- ============================================
-- Added ModelVersion to support target models per version
CREATE TABLE LineTargetModels (
    LineTargetModelId INT PRIMARY KEY IDENTITY(1,1),
    LineNumber INT NOT NULL,
    ModelVersion NVARCHAR(20) NOT NULL DEFAULT '3.5',
    TargetModelName NVARCHAR(255) NOT NULL,
    SetByUser NVARCHAR(100) NULL,
    SetDate DATETIME DEFAULT GETDATE(),
    LastUpdated DATETIME DEFAULT GETDATE(),
    Notes NVARCHAR(500) NULL,
    CONSTRAINT UC_LineNumber_Version UNIQUE(LineNumber, ModelVersion)
);
GO

-- ============================================
-- TABLE: ModelDistributions
-- ============================================
CREATE TABLE ModelDistributions (
    DistributionId INT PRIMARY KEY IDENTITY(1,1),
    ModelFileId INT NOT NULL,
    MCId INT NULL,
    LineNumber INT NULL,
    DistributionType NVARCHAR(20) NOT NULL DEFAULT 'Single', -- 'Single', 'Line', 'Version', 'All'
    Status NVARCHAR(20) NOT NULL DEFAULT 'Pending', -- 'Pending', 'InProgress', 'Completed', 'Failed'
    RequestedDate DATETIME DEFAULT GETDATE(),
    CompletedDate DATETIME NULL,
    ErrorMessage NVARCHAR(MAX) NULL,
    ApplyOnDownload BIT DEFAULT 0,
    CONSTRAINT FK_ModelDistributions_ModelFiles FOREIGN KEY (ModelFileId) 
        REFERENCES ModelFiles(ModelFileId) ON DELETE CASCADE,
    CONSTRAINT FK_ModelDistributions_FactoryMCs FOREIGN KEY (MCId) 
        REFERENCES FactoryMCs(MCId) ON DELETE SET NULL
);
GO

-- ============================================
-- TABLE: AgentCommands
-- ============================================
CREATE TABLE AgentCommands (
    CommandId INT PRIMARY KEY IDENTITY(1,1),
    MCId INT NOT NULL,
    CommandType NVARCHAR(50) NOT NULL,
    CommandData NVARCHAR(MAX) NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    CreatedDate DATETIME DEFAULT GETDATE(),
    ExecutedDate DATETIME NULL,
    ResultData NVARCHAR(MAX) NULL,
    ErrorMessage NVARCHAR(MAX) NULL,
    CONSTRAINT FK_AgentCommands_FactoryMCs FOREIGN KEY (MCId) 
        REFERENCES FactoryMCs(MCId) ON DELETE CASCADE
);
GO

-- ============================================
-- TABLE: SystemLogs
-- ============================================
CREATE TABLE SystemLogs (
    LogId INT PRIMARY KEY IDENTITY(1,1),
    MCId INT NULL,
    Action NVARCHAR(255) NOT NULL,
    ActionType NVARCHAR(50) NOT NULL DEFAULT 'Info',
    Details NVARCHAR(MAX) NULL,
    IPAddress NVARCHAR(50) NULL,
    UserName NVARCHAR(100) NULL,
    Timestamp DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_SystemLogs_FactoryMCs FOREIGN KEY (MCId) 
        REFERENCES FactoryMCs(MCId) ON DELETE SET NULL
);
GO

PRINT 'All tables created successfully (MC Schema)!';
GO