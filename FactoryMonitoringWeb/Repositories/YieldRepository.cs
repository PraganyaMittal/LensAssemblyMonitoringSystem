using System;
using System.Collections.Generic;
using System.Data;
using System.Threading.Tasks;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Models;

namespace FactoryMonitoringWeb.Repositories
{
    public interface IYieldRepository
    {
        Task<ShiftSummary> GetShiftSummaryAsync(string shiftName, DateTime start, DateTime end);
        Task<List<YieldRecord>> GetYieldHistoryAsync(int machineId, DateTime start, DateTime end);
        Task<Dictionary<int, double>> GetYieldSummaryAsync(DateTime start, DateTime end);
        Task ReportYieldAsync(int machineId, string trayId, DateTime date, int good, int total, double yield);
    }

    public class YieldRepository : IYieldRepository
    {
        private readonly FactoryDbContext _context;

        public YieldRepository(FactoryDbContext context)
        {
            _context = context;
        }

        private async Task<SqlConnection> GetConnectionAsync()
        {
            var connection = (SqlConnection)_context.Database.GetDbConnection();
            if (connection.State != ConnectionState.Open)
            {
                await connection.OpenAsync();
            }
            return connection;
        }

        public async Task<ShiftSummary> GetShiftSummaryAsync(string shiftName, DateTime start, DateTime end)
        {
            using var conn = await GetConnectionAsync();
            using var cmd = new SqlCommand(@"
                SELECT 
                    COUNT(*) as TrayCount,
                    ISNULL(SUM(GoodCount), 0) as TotalGood,
                    ISNULL(SUM(TotalCount), 0) as TotalCount
                FROM YieldRecords
                WHERE CreatedAt >= @Start AND CreatedAt < @End", conn);

            cmd.Parameters.AddWithValue("@Start", start);
            cmd.Parameters.AddWithValue("@End", end);

            using var reader = await cmd.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                var totalGood = reader.GetInt32(1);
                var totalCount = reader.GetInt32(2);
                var trayCount = reader.GetInt32(0);

                var summary = new ShiftSummary
                {
                    ShiftName = shiftName,
                    StartTime = start,
                    EndTime = end,
                    TotalProcessed = totalCount,
                    TotalGood = totalGood,
                    TrayCount = trayCount
                };

                summary.AverageYield = totalCount > 0 ? (double)totalGood / totalCount * 100.0 : 0.0;
                return summary;
            }

            return new ShiftSummary { ShiftName = shiftName, StartTime = start, EndTime = end };
        }

        public async Task<List<YieldRecord>> GetYieldHistoryAsync(int machineId, DateTime start, DateTime end)
        {
            var list = new List<YieldRecord>();
            using var conn = await GetConnectionAsync();
            using var cmd = new SqlCommand(@"
                SELECT 
                    Id, MachineId, TrayId, Date, 
                    CASE WHEN EXISTS(SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('YieldRecords') AND name = 'CreatedAt') 
                         THEN CreatedAt 
                         ELSE CAST(Date AS DATETIME) 
                    END as CreatedAt,
                    GoodCount, TotalCount, YieldPercentage
                FROM YieldRecords
                WHERE MachineId = @MachineId AND [Date] >= @Start AND [Date] <= @End
                ORDER BY [Date] DESC", conn);

            cmd.Parameters.AddWithValue("@MachineId", machineId);
            cmd.Parameters.AddWithValue("@Start", start);
            cmd.Parameters.AddWithValue("@End", end);

            using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                list.Add(new YieldRecord
                {
                    Id = reader.GetInt32(0),
                    MachineId = reader.GetInt32(1),
                    TrayId = reader.GetString(2),
                    Date = reader.GetDateTime(3),
                    // Use calculated CreatedAt from SQL (index 4)
                    CreatedAt = reader.GetDateTime(4),
                    GoodCount = reader.GetInt32(5),
                    TotalCount = reader.GetInt32(6),
                    YieldPercentage = reader.GetDouble(7)
                });
            }
            return list;
        }

        public async Task<Dictionary<int, double>> GetYieldSummaryAsync(DateTime start, DateTime end)
        {
            var result = new Dictionary<int, double>();
            using var conn = await GetConnectionAsync();
            using var cmd = new SqlCommand(@"
                SELECT MachineId, SUM(GoodCount), SUM(TotalCount)
                FROM YieldRecords
                WHERE [Date] >= @Start AND [Date] <= @End
                GROUP BY MachineId", conn);

            cmd.Parameters.AddWithValue("@Start", start);
            cmd.Parameters.AddWithValue("@End", end);

            using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                var machineId = reader.GetInt32(0);
                var good = reader.GetInt32(1);
                var total = reader.GetInt32(2);
                var yield = total > 0 ? (double)good / total * 100.0 : 0.0;
                result[machineId] = yield;
            }
            return result;
        }

        public async Task ReportYieldAsync(int machineId, string trayId, DateTime date, int good, int total, double yield)
        {
            using var conn = await GetConnectionAsync();
            using var cmd = new SqlCommand(@"
                MERGE YieldRecords AS target
                USING (SELECT @MachineId, @TrayId, @Date) AS source (MachineId, TrayId, Date)
                ON (target.MachineId = source.MachineId AND target.TrayId = source.TrayId AND target.Date = source.Date)
                WHEN MATCHED THEN
                    UPDATE SET 
                        GoodCount = @Good,
                        TotalCount = @Total,
                        YieldPercentage = @Yield
                WHEN NOT MATCHED THEN
                    INSERT (MachineId, TrayId, Date, GoodCount, TotalCount, YieldPercentage)
                    VALUES (@MachineId, @TrayId, @Date, @Good, @Total, @Yield);
            ", conn);

            cmd.Parameters.AddWithValue("@MachineId", machineId);
            cmd.Parameters.AddWithValue("@TrayId", trayId);
            cmd.Parameters.AddWithValue("@Date", date);
            cmd.Parameters.AddWithValue("@Good", good);
            cmd.Parameters.AddWithValue("@Total", total);
            cmd.Parameters.AddWithValue("@Yield", yield);

            await cmd.ExecuteNonQueryAsync();
        }
    }
}
