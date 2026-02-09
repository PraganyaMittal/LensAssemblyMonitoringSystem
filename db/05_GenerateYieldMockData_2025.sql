-- ============================================
-- SCRIPT: 05_GenerateYieldMockData_2025.sql
-- PURPOSE: Generates mock yield data for the entire year 2025.
-- USAGE: Run this script to populate the YieldRecords table for testing.
-- ============================================

USE FactoryMonitoringDB;
GO

SET NOCOUNT ON;

DECLARE @StartDate DATE = '2025-01-01';
DECLARE @EndDate DATE = '2025-12-31';
DECLARE @CurrentDate DATE = @StartDate;
DECLARE @GlobalTrayIndex INT = 1;
DECLARE @MachineId INT = 1;

PRINT 'Starting Data Generation for 2025...';

BEGIN TRANSACTION;

-- Optional: Clear existing 2025 data to avoid duplicates if re-running
-- DELETE FROM YieldRecords WHERE Date >= @StartDate AND Date <= @EndDate;

WHILE @CurrentDate <= @EndDate
BEGIN
    DECLARE @TraysPerDay INT = 123;
    DECLARE @DailyTrayCounter INT = 0;

    WHILE @DailyTrayCounter < @TraysPerDay
    BEGIN
        -- Generate slightly random GoodCount (98, 99, 100)
        DECLARE @TotalCount INT = 100;
        DECLARE @GoodCount INT = 98 + (ABS(CHECKSUM(NEWID())) % 3); -- 98..100
        
        DECLARE @Yield FLOAT = CAST(@GoodCount AS FLOAT) / CAST(@TotalCount AS FLOAT) * 100.0;
        
        -- TrayId format: machine_result_Assy_Tray{N}
        -- The Agent uses the filename (without extension) as the TrayId.
        DECLARE @TrayId NVARCHAR(50) = 'machine_result_Assy_Tray' + CAST(@GlobalTrayIndex AS NVARCHAR(20));

        -- Insert if not exists (simple check, or just insert if table empty)
        IF NOT EXISTS (SELECT 1 FROM YieldRecords WHERE MachineId = @MachineId AND Date = @CurrentDate AND TrayId = @TrayId)
        BEGIN
            INSERT INTO YieldRecords (MachineId, Date, TrayId, GoodCount, TotalCount, YieldPercentage)
            VALUES (@MachineId, @CurrentDate, @TrayId, @GoodCount, @TotalCount, @Yield);
        END

        SET @GlobalTrayIndex = @GlobalTrayIndex + 1;
        SET @DailyTrayCounter = @DailyTrayCounter + 1;
    END

    -- Progress indicator every month (approx 30 * 123)
    IF DAY(@CurrentDate) = 1
    BEGIN
        PRINT 'Processing complete for ' + CAST(@CurrentDate AS NVARCHAR(20));
    END

    SET @CurrentDate = DATEADD(DAY, 1, @CurrentDate);
END

COMMIT TRANSACTION;

PRINT 'Data Generation Complete.';
PRINT 'Total Records Created: ' + CAST((@GlobalTrayIndex - 1) AS NVARCHAR(20));
GO
