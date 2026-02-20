-- ============================================
-- SCRIPT: 05_GenerateYieldMockData_2025.sql
-- PURPOSE: Generates mock yield data for the entire year 2025 (SET-BASED, FAST)
-- TARGET:  MachineId = 1 only, 123 trays per day
-- USAGE:   Run AFTER NewQuery.sql + 06_UpdateSampleData.sql
-- ============================================

USE FactoryMonitoringDB;
GO

SET NOCOUNT ON;

-- Optional: Clear existing 2025 data to avoid duplicates if re-running
DELETE FROM YieldRecords WHERE MachineId = 1 AND Date >= '2025-01-01' AND Date <= '2025-12-31';

PRINT 'Starting fast set-based data generation for 2025...';

-- Step 1: Generate a numbers table (0 to 122 for 123 trays per day)
;WITH Trays AS (
    SELECT TOP 123 
        ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 AS TrayOffset
    FROM sys.all_objects
),
-- Step 2: Generate all dates in 2025
Dates AS (
    SELECT CAST('2025-01-01' AS DATE) AS [Date]
    UNION ALL
    SELECT DATEADD(DAY, 1, [Date])
    FROM Dates
    WHERE [Date] < '2025-12-31'
),
-- Step 3: Cross join to get every date + tray combo
AllRows AS (
    SELECT 
        d.[Date],
        t.TrayOffset,
        -- Row number across the entire year for TrayId
        ROW_NUMBER() OVER (ORDER BY d.[Date], t.TrayOffset) AS GlobalTrayIndex
    FROM Dates d
    CROSS JOIN Trays t
)
-- Step 4: Insert all rows at once
INSERT INTO YieldRecords (MachineId, Date, TrayId, GoodCount, TotalCount, YieldPercentage)
SELECT
    1 AS MachineId,
    [Date],
    'machine_result_Assy_Tray' + CAST(GlobalTrayIndex AS NVARCHAR(20)) AS TrayId,
    -- Random GoodCount: 90% chance of 98-100, 10% chance of 95-97
    CASE 
        WHEN ABS(CHECKSUM(NEWID())) % 10 = 0 THEN 95 + (ABS(CHECKSUM(NEWID())) % 3)
        ELSE 98 + (ABS(CHECKSUM(NEWID())) % 3)
    END AS GoodCount,
    100 AS TotalCount,
    -- YieldPercentage will be recalculated below
    0.0 AS YieldPercentage
FROM AllRows
OPTION (MAXRECURSION 366);

-- Step 5: Update YieldPercentage based on actual GoodCount
UPDATE YieldRecords 
SET YieldPercentage = CAST(GoodCount AS FLOAT) / CAST(TotalCount AS FLOAT) * 100.0
WHERE MachineId = 1 AND Date >= '2025-01-01' AND Date <= '2025-12-31';

DECLARE @Count INT = (SELECT COUNT(*) FROM YieldRecords WHERE MachineId = 1 AND Date >= '2025-01-01' AND Date <= '2025-12-31');

PRINT '';
PRINT '========================================';
PRINT '  Yield Data Generation Complete!';
PRINT '  Total Records: ' + CAST(@Count AS NVARCHAR(20));
PRINT '  Date Range: 2025-01-01 to 2025-12-31';
PRINT '  Machine: MCId = 1';
PRINT '========================================';
GO
