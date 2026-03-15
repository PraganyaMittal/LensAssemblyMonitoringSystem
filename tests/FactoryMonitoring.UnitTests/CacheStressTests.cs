using FactoryMonitoringWeb.Services;

using FluentAssertions;
using Microsoft.Extensions.Logging;
using Moq;
using System.Collections.Concurrent;
using System.Diagnostics;

namespace FactoryMonitoring.UnitTests
{
    
    
    
    
    
    
    
    
    public class CacheStressTests
    {
        private readonly Mock<ILogger<LruSizeBasedLogCache>> _mockLogger;

        public CacheStressTests()
        {
            _mockLogger = new Mock<ILogger<LruSizeBasedLogCache>>();
        }

        [Fact]
        public void StressTest_100MB_Limit_EnforcedUnderLoad()
        {
            
            var maxSizeBytes = 100L * 1024 * 1024; 
            var cache = new LruSizeBasedLogCache(_mockLogger.Object, maxSizeBytes);

            
            var itemSizeBytes = 10L * 1024 * 1024; 
            for (int i = 0; i < 15; i++)
            {
                var content = CreateLargeContent($"file_{i}.log", itemSizeBytes);
                cache.Set($"key_{i}", content);
            }

            
            var stats = cache.GetStats();
            stats.TotalSizeBytes.Should().BeLessThanOrEqualTo(maxSizeBytes);
            stats.EvictionCount.Should().BeGreaterThan(0, "Some items should have been evicted");
            
            
            stats.ItemCount.Should().BeLessThanOrEqualTo(10);
        }

        [Fact]
        public async Task StressTest_ConcurrentAccess_ThreadSafe()
        {
            
            var cache = new LruSizeBasedLogCache(_mockLogger.Object, 50 * 1024 * 1024); 
            var errors = new ConcurrentBag<Exception>();
            var taskCount = 100;
            var operationsPerTask = 50;

            
            var tasks = Enumerable.Range(0, taskCount).Select(t => Task.Run(() =>
            {
                try
                {
                    var random = new Random(t);
                    for (int i = 0; i < operationsPerTask; i++)
                    {
                        var key = $"key_{random.Next(50)}";
                        
                        if (random.Next(3) == 0)
                        {
                            
                            cache.Get(key);
                        }
                        else
                        {
                            
                            var content = CreateContent($"file_{t}_{i}.log", random.Next(1000, 10000));
                            cache.Set(key, content);
                        }
                    }
                }
                catch (Exception ex)
                {
                    errors.Add(ex);
                }
            }));

            await Task.WhenAll(tasks);

            
            errors.Should().BeEmpty("Cache should be thread-safe");

            var stats = cache.GetStats();
            stats.ItemCount.Should().BeGreaterThan(0);
        }

        [Fact]
        public void StressTest_LRU_EvictionOrder_UnderLoad()
        {
            
            var cache = new LruSizeBasedLogCache(_mockLogger.Object, 30 * 1024);

            
            for (int i = 0; i < 10; i++)
            {
                cache.Set($"key_{i}", CreateContent($"file_{i}.log", 10 * 1024));
            }

            
            var stats = cache.GetStats();
            stats.ItemCount.Should().Be(3);

            
            cache.Get("key_7").Should().NotBeNull();
            cache.Get("key_8").Should().NotBeNull();
            cache.Get("key_9").Should().NotBeNull();

            
            cache.Get("key_0").Should().BeNull();
            cache.Get("key_1").Should().BeNull();
        }

        [Fact]
        public void StressTest_HighThroughput_MeasuresPerformance()
        {
            
            var cache = new LruSizeBasedLogCache(_mockLogger.Object, 100 * 1024 * 1024); 
            var stopwatch = Stopwatch.StartNew();
            var operationCount = 10000;

            
            for (int i = 0; i < operationCount; i++)
            {
                var key = $"key_{i % 100}"; 
                var content = CreateContent($"file_{i}.log", 1024); 
                cache.Set(key, content);
                cache.Get(key);
            }

            stopwatch.Stop();

            
            var opsPerSecond = operationCount * 2 / stopwatch.Elapsed.TotalSeconds; 
            opsPerSecond.Should().BeGreaterThan(1000, "Cache should handle >1000 ops/sec");
            
            
            var avgOpTimeMs = stopwatch.Elapsed.TotalMilliseconds / (operationCount * 2);
            
            
        }

        #region Helpers

        private static CompressedLogContent CreateContent(string fileName, long size)
        {
            return new CompressedLogContent
            {
                FileName = fileName,
                CompressedData = new byte[size],
                CompressedSize = size,
                OriginalSize = size * 2
            };
        }

        private static CompressedLogContent CreateLargeContent(string fileName, long size)
        {
            
            
            return new CompressedLogContent
            {
                FileName = fileName,
                CompressedData = new byte[1024], 
                CompressedSize = size, 
                OriginalSize = size * 2
            };
        }

        #endregion
    }
}
