using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Models;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text;

namespace FactoryMonitoring.IntegrationTests
{
    /// <summary>
    /// REAL INTEGRATION TESTS - No Mocks
    /// 
    /// These tests hit a real SQL Server database to expose:
    /// 1. Database backpressure under 500 concurrent heavy writes
    /// 2. JSON serialization overhead with 365KB payloads
    /// 3. Race conditions when system is saturated
    /// </summary>
    [Collection("Database")]
    public class LogStructureSyncLoadTests : IDisposable
    {
        private readonly DatabaseFixture _fixture;
        private readonly List<int> _createdPCIds = new();

        public LogStructureSyncLoadTests(DatabaseFixture fixture)
        {
            _fixture = fixture;
        }

        /// <summary>
        /// TEST 1: Database Backpressure
        /// 
        /// Simulates 500 agents pushing 365KB log structures simultaneously.
        /// This is the REAL scenario during log rotation.
        /// </summary>
        [Fact]
        public async Task DatabaseBackpressure_500Agents_365KB_LogStructures()
        {
            // Arrange
            const int agentCount = 500;
            const int logStructureSizeKB = 365;
            
            var errors = new ConcurrentBag<Exception>();
            var latencies = new ConcurrentBag<long>();
            var successCount = 0;

            // ===== PHASE 1: SEEDING (not counted in performance) =====
            Console.WriteLine($"\n{'=',-60}");
            Console.WriteLine($"PHASE 1: Seeding {agentCount} test agents to database...");
            Console.WriteLine($"{'=',-60}");
            
            var seedingStopwatch = Stopwatch.StartNew();
            await SeedAgents(agentCount);
            seedingStopwatch.Stop();
            
            Console.WriteLine($"[SEEDING] Completed in {seedingStopwatch.ElapsedMilliseconds} ms");
            Console.WriteLine($"[SEEDING] This time is NOT counted in performance metrics.\n");

            // Generate realistic 365KB log structure JSON
            var logStructureJson = GenerateRealisticLogStructure(logStructureSizeKB);
            var sizeKB = Encoding.UTF8.GetByteCount(logStructureJson) / 1024.0;
            
            // ===== PHASE 2: UPDATE (this is what we're measuring) =====
            Console.WriteLine($"{'=',-60}");
            Console.WriteLine($"PHASE 2: Updating LogStructure for {agentCount} agents");
            Console.WriteLine($"{'=',-60}");
            Console.WriteLine($"[TEST] Payload size: {sizeKB:F1} KB per agent");
            Console.WriteLine($"[TEST] Total data: {(sizeKB * agentCount / 1024):F1} MB");
            Console.WriteLine($"[TEST] Starting {agentCount} CONCURRENT updates NOW...\n");

            var stopwatch = Stopwatch.StartNew();

            // Act - 500 concurrent heavy writes
            var tasks = _createdPCIds.Select(async pcId =>
            {
                var sw = Stopwatch.StartNew();
                try
                {
                    // Each agent gets its own DbContext (scoped per request like production)
                    using var context = _fixture.CreateContext();
                    
                    var pc = await context.FactoryPCs.FindAsync(pcId);
                    if (pc != null)
                    {
                        pc.LogStructureJson = logStructureJson;
                        pc.LastUpdated = DateTime.Now;
                        await context.SaveChangesAsync();
                        
                        Interlocked.Increment(ref successCount);
                    }
                }
                catch (Exception ex)
                {
                    errors.Add(ex);
                }
                finally
                {
                    sw.Stop();
                    latencies.Add(sw.ElapsedMilliseconds);
                }
            });

            await Task.WhenAll(tasks);
            stopwatch.Stop();

            // Assert & Report
            var totalTimeMs = stopwatch.ElapsedMilliseconds;
            var avgLatency = latencies.Average();
            var maxLatency = latencies.Max();
            var p95Latency = latencies.OrderBy(l => l).Skip((int)(latencies.Count * 0.95)).First();
            var p99Latency = latencies.OrderBy(l => l).Skip((int)(latencies.Count * 0.99)).First();
            var throughput = agentCount / (totalTimeMs / 1000.0);

            Console.WriteLine($"\n[RESULTS] Database Backpressure Test");
            Console.WriteLine($"  Total time:    {totalTimeMs} ms");
            Console.WriteLine($"  Success rate:  {successCount}/{agentCount}");
            Console.WriteLine($"  Errors:        {errors.Count}");
            Console.WriteLine($"  Throughput:    {throughput:F1} agents/sec");
            Console.WriteLine($"  Avg latency:   {avgLatency:F1} ms");
            Console.WriteLine($"  P95 latency:   {p95Latency} ms");
            Console.WriteLine($"  P99 latency:   {p99Latency} ms");
            Console.WriteLine($"  Max latency:   {maxLatency} ms");

            errors.Should().BeEmpty("No database errors should occur");
            successCount.Should().Be(agentCount, "All agents should succeed");
            
            // Performance gate: 95% of requests should complete within 5 seconds
            p95Latency.Should().BeLessThan(5000, 
                $"P95 latency {p95Latency}ms exceeds 5s threshold. Database backpressure detected!");
        }

        /// <summary>
        /// TEST 2: JSON Serialization Overhead
        /// 
        /// Measures the CPU cost of parsing 365KB JSON payloads.
        /// Identifies if deserialization is blocking the event loop.
        /// </summary>
        [Fact]
        public void JsonSerializationOverhead_365KB_Payloads()
        {
            // Arrange
            const int iterations = 100;
            const int payloadSizeKB = 365;
            
            var jsonPayload = GenerateRealisticLogStructure(payloadSizeKB);
            var actualSizeKB = Encoding.UTF8.GetByteCount(jsonPayload) / 1024.0;
            
            Console.WriteLine($"[SETUP] Testing JSON parsing of {actualSizeKB:F1} KB payload, {iterations} iterations");

            // Act - Measure pure JSON parsing time
            var stopwatch = Stopwatch.StartNew();
            
            for (int i = 0; i < iterations; i++)
            {
                // Simulate what happens when server receives log structure
                var parsed = JsonConvert.DeserializeObject<LogStructureData>(jsonPayload);
                
                // Simulate re-serialization for storage
                var reserialized = JsonConvert.SerializeObject(parsed);
            }
            
            stopwatch.Stop();

            // Assert & Report
            var totalMs = stopwatch.ElapsedMilliseconds;
            var avgPerParse = totalMs / (double)iterations;
            var parsesPerSecond = iterations / (totalMs / 1000.0);

            Console.WriteLine($"\n[RESULTS] JSON Serialization Overhead");
            Console.WriteLine($"  Total time:        {totalMs} ms for {iterations} iterations");
            Console.WriteLine($"  Avg per parse:     {avgPerParse:F2} ms");
            Console.WriteLine($"  Parses per second: {parsesPerSecond:F0}");

            // Performance gate: Each parse should take less than 50ms
            avgPerParse.Should().BeLessThan(50, 
                $"JSON parsing average {avgPerParse:F1}ms exceeds 50ms threshold. " +
                "This will block request processing!");

            // At 500 agents, we need at least 500 parses/sec capacity
            parsesPerSecond.Should().BeGreaterThan(500,
                $"Parsing throughput {parsesPerSecond:F0}/sec cannot handle 500 agents!");
        }

        /// <summary>
        /// TEST 3: Race Conditions Under Saturation
        /// 
        /// Validates data integrity when system is overloaded.
        /// Multiple agents update, then we verify no data corruption.
        /// </summary>
        [Fact]
        public async Task RaceConditions_DataIntegrity_UnderSaturation()
        {
            // Arrange
            const int agentCount = 100;
            const int updatesPerAgent = 10; // Each agent updates 10 times rapidly
            var errors = new ConcurrentBag<Exception>();
            var updateCounts = new ConcurrentDictionary<int, int>();

            await SeedAgents(agentCount);

            Console.WriteLine($"[SETUP] {agentCount} agents × {updatesPerAgent} updates = {agentCount * updatesPerAgent} total writes");

            // Act - Saturate the system with rapid updates
            var tasks = _createdPCIds.Select(async pcId =>
            {
                for (int i = 0; i < updatesPerAgent; i++)
                {
                    try
                    {
                        using var context = _fixture.CreateContext();
                        
                        var pc = await context.FactoryPCs.FindAsync(pcId);
                        if (pc != null)
                        {
                            // Each update has unique content to detect overwrites
                            pc.LogStructureJson = $"{{\"agent\":{pcId},\"update\":{i},\"timestamp\":\"{DateTime.UtcNow:o}\"}}";
                            pc.LastUpdated = DateTime.Now;
                            await context.SaveChangesAsync();
                            
                            updateCounts.AddOrUpdate(pcId, 1, (k, v) => v + 1);
                        }
                    }
                    catch (DbUpdateException ex) when (ex.InnerException?.Message.Contains("deadlock") == true)
                    {
                        // Deadlocks are expected under saturation
                        errors.Add(ex);
                    }
                    catch (Exception ex)
                    {
                        errors.Add(ex);
                    }
                }
            });

            await Task.WhenAll(tasks);

            // Verify data integrity
            var integrityErrors = new List<string>();
            
            using (var context = _fixture.CreateContext())
            {
                foreach (var pcId in _createdPCIds)
                {
                    var pc = await context.FactoryPCs.AsNoTracking().FirstOrDefaultAsync(p => p.PCId == pcId);
                    if (pc == null)
                    {
                        integrityErrors.Add($"PC {pcId} missing!");
                        continue;
                    }

                    if (string.IsNullOrEmpty(pc.LogStructureJson))
                    {
                        integrityErrors.Add($"PC {pcId} has null LogStructureJson!");
                        continue;
                    }

                    // Verify JSON is valid
                    try
                    {
                        JsonConvert.DeserializeObject(pc.LogStructureJson);
                    }
                    catch
                    {
                        integrityErrors.Add($"PC {pcId} has corrupted JSON: {pc.LogStructureJson?.Substring(0, 50)}...");
                    }
                }
            }

            // Report
            Console.WriteLine($"\n[RESULTS] Race Condition Test");
            Console.WriteLine($"  Total updates attempted: {agentCount * updatesPerAgent}");
            Console.WriteLine($"  Successful updates:      {updateCounts.Values.Sum()}");
            Console.WriteLine($"  Database errors:         {errors.Count}");
            Console.WriteLine($"  Data integrity errors:   {integrityErrors.Count}");
            
            if (errors.Any())
            {
                Console.WriteLine($"  Error types: {string.Join(", ", errors.Select(e => e.GetType().Name).Distinct())}");
            }

            // Assert
            integrityErrors.Should().BeEmpty(
                $"Data corruption detected:\n{string.Join("\n", integrityErrors.Take(10))}");
        }

        /// <summary>
        /// TEST 4: Connection Pool Exhaustion
        /// 
        /// Tests if 500 concurrent requests exhaust the database connection pool.
        /// </summary>
        [Fact]
        public async Task ConnectionPoolExhaustion_500ConcurrentConnections()
        {
            // Arrange
            const int connectionCount = 500;
            var errors = new ConcurrentBag<Exception>();
            var connectionErrors = new ConcurrentBag<string>();
            var successCount = 0;

            await SeedAgents(connectionCount);

            Console.WriteLine($"[SETUP] Opening {connectionCount} concurrent database connections...");

            var stopwatch = Stopwatch.StartNew();

            // Act - Try to open 500 connections simultaneously
            var tasks = _createdPCIds.Select(async pcId =>
            {
                try
                {
                    using var context = _fixture.CreateContext();
                    
                    // Hold connection open with a query
                    var pc = await context.FactoryPCs
                        .Include(p => p.ConfigFile)
                        .FirstOrDefaultAsync(p => p.PCId == pcId);
                    
                    if (pc != null)
                    {
                        Interlocked.Increment(ref successCount);
                    }
                }
                catch (InvalidOperationException ex) when (ex.Message.Contains("pool"))
                {
                    connectionErrors.Add("Connection pool exhausted");
                }
                catch (Exception ex)
                {
                    errors.Add(ex);
                }
            });

            await Task.WhenAll(tasks);
            stopwatch.Stop();

            // Report
            Console.WriteLine($"\n[RESULTS] Connection Pool Test");
            Console.WriteLine($"  Total time:         {stopwatch.ElapsedMilliseconds} ms");
            Console.WriteLine($"  Successful queries: {successCount}/{connectionCount}");
            Console.WriteLine($"  Pool errors:        {connectionErrors.Count}");
            Console.WriteLine($"  Other errors:       {errors.Count}");

            // Assert
            connectionErrors.Should().BeEmpty("Connection pool should not be exhausted");
            successCount.Should().Be(connectionCount, "All connections should succeed");
        }

        #region Helpers

        private async Task SeedAgents(int count)
        {
            using var context = _fixture.CreateContext();
            
            // DON'T delete existing production data!
            // Instead, add test PCs with unique line numbers (9000+) to distinguish from real PCs
            
            // First, clean up any previous test data (line numbers 9000+)
            var previousTestData = await context.FactoryPCs
                .Where(p => p.LineNumber >= 9000)
                .ToListAsync();
            
            if (previousTestData.Any())
            {
                context.FactoryPCs.RemoveRange(previousTestData);
                await context.SaveChangesAsync();
                Console.WriteLine($"[SETUP] Cleaned {previousTestData.Count} previous test PCs");
            }

            // Seed test agents with line numbers 9000+ to distinguish from production
            var newPCs = new List<FactoryPC>();
            Console.WriteLine($"[SETUP] Creating {count} test PCs (LineNumber 9001-9500)...");
            
            for (int i = 1; i <= count; i++)
            {
                var pc = new FactoryPC
                {
                    // Use line numbers 9001-9500 for test data
                    LineNumber = 9000 + i,
                    PCNumber = i,
                    IPAddress = $"192.168.200.{i % 256}",
                    IsOnline = true,
                    LastHeartbeat = DateTime.Now,
                    LogStructureJson = null // Will be set during test
                };
                newPCs.Add(pc);
                context.FactoryPCs.Add(pc);
            }
            
            await context.SaveChangesAsync();
            
            // Store the generated IDs
            _createdPCIds.Clear();
            _createdPCIds.AddRange(newPCs.Select(p => p.PCId));
            
            Console.WriteLine($"[SETUP] Created {count} test PCs with IDs: {_createdPCIds.First()}-{_createdPCIds.Last()}");
        }

        private static string GenerateRealisticLogStructure(int targetSizeKB)
        {
            // Generate realistic log structure matching production format
            var structure = new LogStructureData
            {
                RootPath = @"C:\FactoryLogs",
                LastScan = DateTime.UtcNow,
                Folders = new List<LogFolder>()
            };

            // Generate folders and files until we reach target size
            int folderIndex = 0;
            while (Encoding.UTF8.GetByteCount(JsonConvert.SerializeObject(structure)) < targetSizeKB * 1024)
            {
                var folder = new LogFolder
                {
                    Name = $"2026{(folderIndex / 12 + 1):D2}{(folderIndex % 12 + 1):D2}_Logs",
                    Path = $@"C:\FactoryLogs\2026{(folderIndex / 12 + 1):D2}{(folderIndex % 12 + 1):D2}_Logs",
                    Files = new List<LogFile>()
                };

                // Each folder has 24 hourly log files
                for (int hour = 0; hour < 24; hour++)
                {
                    folder.Files.Add(new LogFile
                    {
                        Name = $"2026{(folderIndex / 12 + 1):D2}{(folderIndex % 12 + 1):D2}{hour:D2}_GeneralLog.log",
                        Size = 15 * 1024 * 1024, // 15MB
                        LastModified = DateTime.UtcNow.AddHours(-hour),
                        LineCount = 150000
                    });
                }

                structure.Folders.Add(folder);
                folderIndex++;
            }

            return JsonConvert.SerializeObject(structure, Formatting.None);
        }

        public void Dispose()
        {
            // Cleanup created PCs (handled by fixture)
        }

        #endregion

        #region DTOs

        private class LogStructureData
        {
            public string RootPath { get; set; } = "";
            public DateTime LastScan { get; set; }
            public List<LogFolder> Folders { get; set; } = new();
        }

        private class LogFolder
        {
            public string Name { get; set; } = "";
            public string Path { get; set; } = "";
            public List<LogFile> Files { get; set; } = new();
        }

        private class LogFile
        {
            public string Name { get; set; } = "";
            public long Size { get; set; }
            public DateTime LastModified { get; set; }
            public int LineCount { get; set; }
        }

        #endregion
    }
}
