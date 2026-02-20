USE FactoryMonitoringDB;
GO

CREATE PROCEDURE sp_RegisterOrUpdateMC
    @LineNumber INT,
    @MCNumber INT,
    @IPAddress NVARCHAR(50),
    @ConfigFilePath NVARCHAR(500),
    @LogFolderPath NVARCHAR(500),
    @ModelFolderPath NVARCHAR(500),
    @ModelVersion NVARCHAR(20) = '3.5',
    @MCId INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    -- Lookup now includes ModelVersion to support multiple versions for same Line/MC
    SELECT @MCId = MCId
    FROM FactoryMCs
    WHERE LineNumber = @LineNumber
      AND MCNumber = @MCNumber
      AND ModelVersion = @ModelVersion;

    IF @MCId IS NULL
    BEGIN
        INSERT INTO FactoryMCs (
            LineNumber,
            MCNumber,
            IPAddress,
            ConfigFilePath,
            LogFolderPath,
            ModelFolderPath,
            ModelVersion,
            IsOnline,
            IsApplicationRunning,
            LastHeartbeat
        )
        VALUES (
            @LineNumber,
            @MCNumber,
            @IPAddress,
            @ConfigFilePath,
            @LogFolderPath,
            @ModelFolderPath,
            @ModelVersion,
            1,
            0,
            GETDATE()
        );

        SET @MCId = SCOPE_IDENTITY();
    END
    ELSE
    BEGIN
        UPDATE FactoryMCs
        SET IPAddress = @IPAddress,
            ConfigFilePath = @ConfigFilePath,
            LogFolderPath = @LogFolderPath,
            ModelFolderPath = @ModelFolderPath,
            ModelVersion = @ModelVersion,
            IsOnline = 1,
            LastHeartbeat = GETDATE(),
            LastUpdated = GETDATE()
        WHERE MCId = @MCId;
    END
END
GO

PRINT 'Stored procedures created successfully!';
GO