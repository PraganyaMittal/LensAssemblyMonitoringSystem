using LensAssemblyMonitoringWeb.Data;
using LensAssemblyMonitoringWeb.Models;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text;

namespace LensAssemblyMonitoring.IntegrationTests
{
    
    
    
    
    [Collection("Database")]
    public class LogStructureSyncLoadTests : IDisposable
    {
        private readonly DatabaseFixture _fixture;
        private readonly List<int> _createdMCIds = new();

        public LogStructureSyncLoadTests(DatabaseFixture fixture)
        {
            _fixture = fixture;
        }

        
        
        
        
        
        
        [Fact]
        public async Task DatabaseBackpressure_500Agents_365KB_LogStructures()
        {
            
            const int agentCount = 500;
            const int logStructureSizeKB = 365;
            
            var errors = new ConcurrentBag<Exception>();
            var latencies = new ConcurrentBag<long>();
            var successCount = 0;
            var semaphore = new SemaphoreSlim(100, 100);

            
            Console.WriteLine($"Seeding {agentCount} agents...");
            
            var seedingStopwatch = Stopwatch.StartNew();
            await SeedAgents(agentCount);
            seedingStopwatch.Stop();
            
            Console.WriteLine($"[SEEDING] Completed in {seedingStopwatch.ElapsedMilliseconds} ms");
            Console.WriteLine($"[SEEDING] This time is NOT counted in performance metrics.\n");

            
            var logStructureJson = GenerateRealisticLogStructure(logStructureSizeKB);
            var sizeKB = Encoding.UTF8.GetByteCount(logStructureJson) / 1024.0;
            
            
            Console.WriteLine($"Updating LogStructure for {agentCount} agents...");
            Console.WriteLine($"Payload size: {sizeKB:F1} KB");
            Console.WriteLine($"[TEST] Total data: {(sizeKB * agentCount / 1024):F1} MB");
            Console.WriteLine($"[TEST] Starting {agentCount} CONCURRENT updates NOW...\n");

            var stopwatch = Stopwatch.StartNew();

            
            var tasks = _createdMCIds.Select(async pcId =>
            {
                await semaphore.WaitAsync();
                var sw = Stopwatch.StartNew();
                try
                {
                    
                    using var context = _fixture.CreateContext();
                    
                    var pc = await context.LensAssemblyMCs.FindAsync(pcId);
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
                    semaphore.Release();
                }
            });

            await Task.WhenAll(tasks);
            stopwatch.Stop();

            
            var totalTimeMs = stopwatch.ElapsedMilliseconds;
            var avgLatency = latencies.Average();
            var maxLatency = latencies.Max();
            var p95Latency = latencies.OrderBy(l => l).Skip((int)(latencies.Count * 0.95)).First();
            var p99Latency = latencies.OrderBy(l => l).Skip((int)(latencies.Count * 0.99)).First();
            var throughput = agentCount / (totalTimeMs / 1000.0);

            
            Console.WriteLine($"\n[RESULTS] Database Backpressure: {successCount}/{agentCount} succeeded");
            errors.Should().BeEmpty();
            successCount.Should().Be(agentCount);
        }

        [Fact]
        public void JsonSerializationOverhead_365KB_Payloads()
        {
            
            const int iterations = 100;
            const int payloadSizeKB = 365;
            
            var jsonPayload = GenerateRealisticLogStructure(payloadSizeKB);
            var actualSizeKB = Encoding.UTF8.GetByteCount(jsonPayload) / 1024.0;
            
            Console.WriteLine($"[SETUP] Testing JSON parsing of {actualSizeKB:F1} KB payload, {iterations} iterations");

            
            for (int i = 0; i < iterations; i++)
            {
                var parsed = JsonConvert.DeserializeObject<LogStructureData>(jsonPayload);
                var reserialized = JsonConvert.SerializeObject(parsed);
            }
        }

        [Fact]
        public async Task RaceConditions_DataIntegrity_UnderSaturation()
        {
            
            const int agentCount = 100;
            const int updatesPerAgent = 10; 
            var errors = new ConcurrentBag<Exception>();
            var updateCounts = new ConcurrentDictionary<int, int>();

            await SeedAgents(agentCount);
            Console.WriteLine($"Running {agentCount} agents x {updatesPerAgent} updates...");

            
            var tasks = _createdMCIds.Select(async pcId =>
            {
                for (int i = 0; i < updatesPerAgent; i++)
                {
                    try
                    {
                        using var context = _fixture.CreateContext();
                        
                        var pc = await context.LensAssemblyMCs.FindAsync(pcId);
                        if (pc != null)
                        {
                            
                            pc.LogStructureJson = $"{{\"agent\":{pcId},\"update\":{i},\"timestamp\":\"{DateTime.UtcNow:o}\"}}";
                            pc.LastUpdated = DateTime.Now;
                            await context.SaveChangesAsync();
                            
                            updateCounts.AddOrUpdate(pcId, 1, (k, v) => v + 1);
                        }
                    }
                    catch (DbUpdateException ex) when (ex.InnerException?.Message.Contains("deadlock") == true)
                    {
                        
                        errors.Add(ex);
                    }
                    catch (Exception ex)
                    {
                        errors.Add(ex);
                    }
                }
            });

            await Task.WhenAll(tasks);

            
            var integrityErrors = new List<string>();
            
            using (var context = _fixture.CreateContext())
            {
                foreach (var pcId in _createdMCIds)
                {
                    var pc = await context.LensAssemblyMCs.AsNoTracking().FirstOrDefaultAsync(p => p.MCId == pcId);
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

            
            Console.WriteLine($"\n[RESULTS] Race Condition Test");
            Console.WriteLine($"  Total updates attempted: {agentCount * updatesPerAgent}");
            Console.WriteLine($"  Successful updates:      {updateCounts.Values.Sum()}");
            Console.WriteLine($"  Database errors:         {errors.Count}");
            Console.WriteLine($"  Data integrity errors:   {integrityErrors.Count}");
            
            if (errors.Any())
            {
                Console.WriteLine($"  Error types: {string.Join(", ", errors.Select(e => e.GetType().Name).Distinct())}");
            }

            
            integrityErrors.Should().BeEmpty(
                $"Data corruption detected:\n{string.Join("\n", integrityErrors.Take(10))}");
        }

        [Fact]
        public async Task ConnectionPoolExhaustion_500ConcurrentConnections()
        {
            
            const int connectionCount = 500;
            var errors = new ConcurrentBag<Exception>();
            var connectionErrors = new ConcurrentBag<string>();
            var successCount = 0;

            await SeedAgents(connectionCount);

            Console.WriteLine($"[SETUP] Opening {connectionCount} concurrent database connections...");

            var stopwatch = Stopwatch.StartNew();

            
            var tasks = _createdMCIds.Select(async pcId =>
            {
                try
                {
                    using var context = _fixture.CreateContext();
                    
                    
                    var pc = await context.LensAssemblyMCs
                        .FirstOrDefaultAsync(p => p.MCId == pcId);
                    
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

            
            Console.WriteLine($"\n[RESULTS] Connection Pool Test");
            Console.WriteLine($"  Total time:         {stopwatch.ElapsedMilliseconds} ms");
            Console.WriteLine($"  Successful queries: {successCount}/{connectionCount}");
            Console.WriteLine($"  Pool errors:        {connectionErrors.Count}");
            Console.WriteLine($"  Other errors:       {errors.Count}");

            
            connectionErrors.Should().BeEmpty();
            successCount.Should().Be(connectionCount);
        }

        #region Helpers

        private async Task SeedAgents(int count)
        {
            using var context = _fixture.CreateContext();
            
            
            
            
            
            var previousTestData = await context.LensAssemblyMCs
                .Where(p => p.LineNumber >= 9000)
                .ToListAsync();
            
            if (previousTestData.Any())
            {
                context.LensAssemblyMCs.RemoveRange(previousTestData);
                await context.SaveChangesAsync();
                Console.WriteLine($"[SETUP] Cleaned {previousTestData.Count} previous test PCs");
            }

            
            var newMCs = new List<LensAssemblyMC>();
            Console.WriteLine($"Creating {count} test machines...");
            
            for (int i = 1; i <= count; i++)
            {
                var pc = new LensAssemblyMC
                {
                    
                    LineNumber = 9000 + i,
                    MCNumber = i,
                    IPAddress = $"192.168.200.{i % 256}",
                    IsOnline = true,
                    LastHeartbeat = DateTime.Now,
                    LogStructureJson = null 
                };
                newMCs.Add(pc);
                context.LensAssemblyMCs.Add(pc);
            }
            
            await context.SaveChangesAsync();
            
            
            _createdMCIds.Clear();
            _createdMCIds.AddRange(newMCs.Select(p => p.MCId));
            
            Console.WriteLine($"[SETUP] Created {count} test PCs with IDs: {_createdMCIds.First()}-{_createdMCIds.Last()}");
        }

        private static string GenerateRealisticLogStructure(int targetSizeKB)
        {
            
            var structure = new LogStructureData
            {
                RootPath = @"C:\LensAssemblyLogs",
                LastScan = DateTime.UtcNow,
                Folders = new List<LogFolder>()
            };

            
            int folderIndex = 0;
            while (Encoding.UTF8.GetByteCount(JsonConvert.SerializeObject(structure)) < targetSizeKB * 1024)
            {
                var folder = new LogFolder
                {
                    Name = $"2026{(folderIndex / 12 + 1):D2}{(folderIndex % 12 + 1):D2}_Logs",
                    Path = $@"C:\LensAssemblyLogs\2026{(folderIndex / 12 + 1):D2}{(folderIndex % 12 + 1):D2}_Logs",
                    Files = new List<LogFile>()
                };

                
                for (int hour = 0; hour < 24; hour++)
                {
                    folder.Files.Add(new LogFile
                    {
                        Name = $"2026{(folderIndex / 12 + 1):D2}{(folderIndex % 12 + 1):D2}{hour:D2}_GeneralLog.log",
                        Size = 15 * 1024 * 1024, 
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
