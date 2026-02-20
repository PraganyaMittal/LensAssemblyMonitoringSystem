USE FactoryMonitoringDB;
GO

-- FactoryMCs Indexes
CREATE INDEX IX_FactoryMCs_LineNumber ON FactoryMCs(LineNumber);
CREATE INDEX IX_FactoryMCs_IsOnline ON FactoryMCs(IsOnline);
CREATE INDEX IX_FactoryMCs_LastHeartbeat ON FactoryMCs(LastHeartbeat);
CREATE INDEX IX_FactoryMCs_ModelVersion ON FactoryMCs(ModelVersion);
GO

-- ConfigFiles Indexes
CREATE INDEX IX_ConfigFiles_MCId ON ConfigFiles(MCId);
CREATE INDEX IX_ConfigFiles_PendingUpdate ON ConfigFiles(PendingUpdate);
GO

-- Models Indexes
CREATE INDEX IX_Models_MCId ON Models(MCId);
CREATE INDEX IX_Models_IsCurrentModel ON Models(IsCurrentModel);
CREATE INDEX IX_Models_ModelName ON Models(ModelName);
GO

-- ModelFiles Indexes
CREATE INDEX IX_ModelFiles_IsActive ON ModelFiles(IsActive);
CREATE INDEX IX_ModelFiles_UploadedDate ON ModelFiles(UploadedDate);
CREATE INDEX IX_ModelFiles_IsTemplate ON ModelFiles(IsTemplate);
GO

-- LineTargetModels Indexes
CREATE INDEX IX_LineTargetModels_LineNumber ON LineTargetModels(LineNumber);
GO

-- ModelDistributions Indexes
CREATE INDEX IX_ModelDistributions_ModelFileId ON ModelDistributions(ModelFileId);
CREATE INDEX IX_ModelDistributions_MCId ON ModelDistributions(MCId);
CREATE INDEX IX_ModelDistributions_Status ON ModelDistributions(Status);
CREATE INDEX IX_ModelDistributions_DistributionType ON ModelDistributions(DistributionType);
GO

-- AgentCommands Indexes
CREATE INDEX IX_AgentCommands_MCId ON AgentCommands(MCId);
CREATE INDEX IX_AgentCommands_Status ON AgentCommands(Status);
CREATE INDEX IX_AgentCommands_CommandType ON AgentCommands(CommandType);
CREATE INDEX IX_AgentCommands_MCId_Status ON AgentCommands(MCId, Status);
CREATE INDEX IX_AgentCommands_CreatedDate ON AgentCommands(CreatedDate);
GO

-- SystemLogs Indexes
CREATE INDEX IX_SystemLogs_MCId ON SystemLogs(MCId);
CREATE INDEX IX_SystemLogs_ActionType ON SystemLogs(ActionType);
CREATE INDEX IX_SystemLogs_Timestamp ON SystemLogs(Timestamp);
GO

PRINT 'All indexes created successfully!';
GO