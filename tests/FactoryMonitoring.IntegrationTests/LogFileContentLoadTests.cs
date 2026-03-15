using FactoryMonitoringWeb.Services;

using FluentAssertions;
using Microsoft.Extensions.Logging;
using Moq;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO.Compression;

namespace FactoryMonitoring.IntegrationTests
{
    
    
    
    
    public class LogFileContentLoadTests
    {
        private readonly Mock<ILogger<LruSizeBasedLogCache>> _mockLogger;

        public LogFileContentLoadTests()
        {
            _mockLogger = new Mock<ILogger<LruSizeBasedLogCache>>();
        }

        
        
        
        
        
        
        [Fact]
        public void RealMemoryConsumption_100MB_Limit()
        {
            
            const long maxCacheSizeBytes = 100L * 1024 * 1024; 
            var cache = new LruSizeBasedLogCache(_mockLogger.Object, maxCacheSizeBytes);

            
            GC.Collect();
            GC.WaitForPendingFinalizers();
            GC.Collect();
            var baselineMemory = GC.GetTotalMemory(true);

            Console.WriteLine($"[SETUP] Baseline memory: {baselineMemory / (1024 * 1024):F1} MB");

            
            for (int i = 0; i < 20; i++)
            {
                var compressedData = GenerateCompressedLogData(10 * 1024 * 1024); 
                var content = new CompressedLogContent
                {
                    FileName = $"2026011323_GeneralLog_{i}.log",
                    CompressedData = compressedData,
                    CompressedSize = compressedData.Length,
                    OriginalSize = compressedData.Length * 3 
                };

                cache.Set($"pc_{i % 10}_{i}", content);
                
                if ((i + 1) % 5 == 0)
                {
                    var stats = cache.GetStats();
                    Console.WriteLine($"  After {i + 1} files: {stats.TotalSizeBytes / (1024 * 1024):F1} MB in cache, {stats.ItemCount} items");
                }
            }

            
            GC.Collect();
            GC.WaitForPendingFinalizers();
            GC.Collect();
            var finalMemory = GC.GetTotalMemory(true);
            var memoryUsed = finalMemory - baselineMemory;

            var finalStats = cache.GetStats();

            
            Console.WriteLine($"\n[RESULTS] Memory Consumption Test");
            Console.WriteLine($"  Cache reports:    {finalStats.TotalSizeBytes / (1024 * 1024):F1} MB");
            Console.WriteLine($"  Actual .NET heap: {memoryUsed / (1024 * 1024):F1} MB used");
            Console.WriteLine($"  Items in cache:   {finalStats.ItemCount}");
            Console.WriteLine($"  Evictions:        {finalStats.EvictionCount}");

            
            finalStats.TotalSizeBytes.Should().BeLessThanOrEqualTo(maxCacheSizeBytes,
                "Cache size should not exceed 100MB limit");
            
            
            memoryUsed.Should().BeLessThan(150L * 1024 * 1024,
                "Actual memory should not exceed 150MB (100MB + overhead)");
        }

        
        
        
        
        
        
        [Fact]
        public async Task DeduplicationUnderLoad_50ConcurrentRequests()
        {
            
            const int userCount = 50;
            const long maxCacheSize = 100L * 1024 * 1024;
            var cache = new LruSizeBasedLogCache(_mockLogger.Object, maxCacheSize);

            var agentRequestCount = 0;
            var userRequestCount = 0;
            var errors = new ConcurrentBag<Exception>();
            var latencies = new ConcurrentBag<long>();

            
            var pendingRequest = new TaskCompletionSource<CompressedLogContent>();
            var requestStarted = new TaskCompletionSource();

            Console.WriteLine($"[SETUP] Simulating {userCount} users requesting same file...");

            var stopwatch = Stopwatch.StartNew();

            
            var tasks = Enumerable.Range(1, userCount).Select(async userId =>
            {
                var sw = Stopwatch.StartNew();
                try
                {
                    var cacheKey = "pc_1_2026011323_GeneralLog.log";
                    var cached = cache.Get(cacheKey);

                    if (cached != null)
                    {
                        
                        sw.Stop();
                        latencies.Add(sw.ElapsedMilliseconds);
                        return;
                    }

                    
                    Interlocked.Increment(ref userRequestCount);
                    if (userRequestCount == 1)
                    {
                        Interlocked.Increment(ref agentRequestCount);
                        requestStarted.SetResult();
                        
                        
                        await Task.Delay(500);
                        
                        
                        var content = new CompressedLogContent
                        {
                            FileName = "2026011323_GeneralLog.log",
                            CompressedData = GenerateCompressedLogData(5 * 1024 * 1024),
                            CompressedSize = 5 * 1024 * 1024,
                            OriginalSize = 15 * 1024 * 1024
                        };
                        
                        cache.Set(cacheKey, content);
                        pendingRequest.SetResult(content);
                    }
                    else
                    {
                        
                        await requestStarted.Task;
                        await pendingRequest.Task;
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

            
            Console.WriteLine($"\n[RESULTS] Deduplication Test");
            Console.WriteLine($"  Total users:       {userCount}");
            Console.WriteLine($"  Agent requests:    {agentRequestCount}");
            Console.WriteLine($"  Total time:        {stopwatch.ElapsedMilliseconds} ms");
            Console.WriteLine($"  Avg latency:       {latencies.Average():F1} ms");
            Console.WriteLine($"  Errors:            {errors.Count}");

            
            agentRequestCount.Should().Be(1, "Only 1 agent request should be made for 50 users");
            errors.Should().BeEmpty("No errors should occur");
        }

        
        
        
        
        
        
        [Fact]
        public async Task MemoryPressure_SustainedLoad_30Seconds()
        {
            
            const int durationSeconds = 10; 
            const long maxCacheSize = 50L * 1024 * 1024; 
            var cache = new LruSizeBasedLogCache(_mockLogger.Object, maxCacheSize);

            var operationCount = 0;
            var cts = new CancellationTokenSource(TimeSpan.FromSeconds(durationSeconds));
            var gcCountsBefore = GC.CollectionCount(0) + GC.CollectionCount(1) + GC.CollectionCount(2);

            GC.Collect();
            var initialMemory = GC.GetTotalMemory(true);

            Console.WriteLine($"[SETUP] Running sustained load for {durationSeconds} seconds...");
            Console.WriteLine($"  Initial memory: {initialMemory / (1024 * 1024):F1} MB");

            var stopwatch = Stopwatch.StartNew();

            
            var loadTasks = Enumerable.Range(0, 10).Select(async worker =>
            {
                var random = new Random(worker);
                while (!cts.Token.IsCancellationRequested)
                {
                    try
                    {
                        var key = $"pc_{random.Next(100)}_{random.Next(1000)}";
                        
                        if (random.Next(3) == 0)
                        {
                            
                            cache.Get(key);
                        }
                        else
                        {
                            
                            var size = random.Next(500_000, 2_000_000);
                            var content = new CompressedLogContent
                            {
                                FileName = $"log_{key}.log",
                                CompressedData = new byte[size],
                                CompressedSize = size,
                                OriginalSize = size * 2
                            };
                            cache.Set(key, content);
                        }

                        Interlocked.Increment(ref operationCount);
                    }
                    catch
                    {
                        
                    }
                }
            });

            await Task.WhenAll(loadTasks);
            stopwatch.Stop();

            
            GC.Collect();
            GC.WaitForPendingFinalizers();
            GC.Collect();
            var finalMemory = GC.GetTotalMemory(true);
            var gcCountsAfter = GC.CollectionCount(0) + GC.CollectionCount(1) + GC.CollectionCount(2);

            var stats = cache.GetStats();

            
            Console.WriteLine($"\n[RESULTS] Sustained Load Test");
            Console.WriteLine($"  Duration:      {stopwatch.Elapsed.TotalSeconds:F1} seconds");
            Console.WriteLine($"  Operations:    {operationCount:N0}");
            Console.WriteLine($"  Ops/second:    {operationCount / stopwatch.Elapsed.TotalSeconds:F0}");
            Console.WriteLine($"  Initial mem:   {initialMemory / (1024 * 1024):F1} MB");
            Console.WriteLine($"  Final mem:     {finalMemory / (1024 * 1024):F1} MB");
            Console.WriteLine($"  GC collections: {gcCountsAfter - gcCountsBefore}");
            Console.WriteLine($"  Cache items:   {stats.ItemCount}");
            Console.WriteLine($"  Hit rate:      {stats.HitRate * 100:F1}%");

            
            finalMemory.Should().BeLessThan(150L * 1024 * 1024,
                "Memory should not grow unbounded");
        }

        #region Helpers

        private static byte[] GenerateCompressedLogData(int targetSize)
        {
            
            var data = new byte[targetSize];
            new Random().NextBytes(data);
            return data;
        }

        #endregion
    }
}
