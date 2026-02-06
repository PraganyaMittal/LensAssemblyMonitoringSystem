IF OBJECT_ID(N'[__EFMigrationsHistory]') IS NULL
BEGIN
    CREATE TABLE [__EFMigrationsHistory] (
        [MigrationId] nvarchar(150) NOT NULL,
        [ProductVersion] nvarchar(32) NOT NULL,
        CONSTRAINT [PK___EFMigrationsHistory] PRIMARY KEY ([MigrationId])
    );
END;
GO

BEGIN TRANSACTION;
GO

CREATE TABLE [YieldRecords] (
    [Id] int NOT NULL IDENTITY,
    [MachineId] int NOT NULL,
    [TrayId] nvarchar(100) NOT NULL,
    [Timestamp] datetime2 NOT NULL,
    [GoodCount] int NOT NULL,
    [TotalCount] int NOT NULL,
    [YieldPercentage] float NOT NULL,
    CONSTRAINT [PK_YieldRecords] PRIMARY KEY ([Id])
);
GO

CREATE INDEX [IX_YieldRecords_MachineId_Timestamp] ON [YieldRecords] ([MachineId], [Timestamp]);
GO

INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
VALUES (N'20260203062008_AddYieldTable', N'8.0.0');
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

DROP INDEX [IX_YieldRecords_MachineId_Timestamp] ON [YieldRecords];
GO

DECLARE @var0 sysname;
SELECT @var0 = [d].[name]
FROM [sys].[default_constraints] [d]
INNER JOIN [sys].[columns] [c] ON [d].[parent_column_id] = [c].[column_id] AND [d].[parent_object_id] = [c].[object_id]
WHERE ([d].[parent_object_id] = OBJECT_ID(N'[YieldRecords]') AND [c].[name] = N'Timestamp');
IF @var0 IS NOT NULL EXEC(N'ALTER TABLE [YieldRecords] DROP CONSTRAINT [' + @var0 + '];');
ALTER TABLE [YieldRecords] DROP COLUMN [Timestamp];
GO

ALTER TABLE [YieldRecords] ADD [Date] date NOT NULL DEFAULT '0001-01-01';
GO

CREATE INDEX [IX_YieldRecords_MachineId_Date] ON [YieldRecords] ([MachineId], [Date]);
GO

INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
VALUES (N'20260203114505_RenameTimestampToDate', N'8.0.0');
GO

COMMIT;
GO

