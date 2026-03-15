using FactoryMonitoringWeb.Services;

using FactoryMonitoringWeb.Models.DTOs;
using FluentAssertions;
using Microsoft.Extensions.Logging;
using Moq;

namespace FactoryMonitoring.UnitTests
{
    
    
    
    
    
    
    
    
    
    public class LruSizeBasedLogCacheTests
    {
        private readonly Mock<ILogger<LruSizeBasedLogCache>> _mockLogger;

        public LruSizeBasedLogCacheTests()
        {
            _mockLogger = new Mock<ILogger<LruSizeBasedLogCache>>();
        }

        #region Basic Operations

        [Fact]
        public void Get_NonExistentKey_ReturnsNull()
        {
            
            var cache = new LruSizeBasedLogCache(_mockLogger.Object);

            
            var result = cache.Get("nonexistent");

            
            result.Should().BeNull();
        }

        [Fact]
        public void Set_And_Get_ReturnsCorrectValue()
        {
            
            var cache = new LruSizeBasedLogCache(_mockLogger.Object);
            var content = CreateContent("test.log", 1000);

            
            cache.Set("key1", content);
            var result = cache.Get("key1");

            
            result.Should().NotBeNull();
            result!.FileName.Should().Be("test.log");
            result.CompressedSize.Should().Be(1000);
        }

        [Fact]
        public void Remove_ExistingKey_ReturnsTrue()
        {
            
            var cache = new LruSizeBasedLogCache(_mockLogger.Object);
            cache.Set("key1", CreateContent("test.log", 1000));

            
            var removed = cache.Remove("key1");
            var afterRemove = cache.Get("key1");

            
            removed.Should().BeTrue();
            afterRemove.Should().BeNull();
        }

        #endregion

        #region LRU Eviction

        [Fact]
        public void Eviction_RemovesLeastRecentlyUsed()
        {
            
            var cache = new LruSizeBasedLogCache(_mockLogger.Object, maxSizeBytes: 10 * 1024);

            cache.Set("key1", CreateContent("file1.log", 4000)); 
            cache.Set("key2", CreateContent("file2.log", 4000)); 
            

            
            cache.Set("key3", CreateContent("file3.log", 4000)); 

            
            cache.Get("key1").Should().BeNull("key1 should be evicted as LRU");
            cache.Get("key2").Should().NotBeNull("key2 should still exist");
            cache.Get("key3").Should().NotBeNull("key3 should exist");
        }

        [Fact]
        public void Get_UpdatesLRUPosition()
        {
            
            var cache = new LruSizeBasedLogCache(_mockLogger.Object, maxSizeBytes: 10 * 1024);

            cache.Set("key1", CreateContent("file1.log", 4000)); 
            cache.Set("key2", CreateContent("file2.log", 4000)); 

            
            cache.Get("key1");

            
            cache.Set("key3", CreateContent("file3.log", 4000)); 

            
            cache.Get("key1").Should().NotBeNull("key1 was recently accessed");
            cache.Get("key2").Should().BeNull("key2 should be evicted as LRU");
            cache.Get("key3").Should().NotBeNull("key3 should exist");
        }

        #endregion

        #region Size-Based Eviction

        [Fact]
        public void Set_ItemLargerThanMax_DoesNotCache()
        {
            
            var cache = new LruSizeBasedLogCache(_mockLogger.Object, maxSizeBytes: 1024);

            
            cache.Set("key1", CreateContent("large.log", 2048)); 

            
            cache.Get("key1").Should().BeNull("item too large to cache");
            cache.GetStats().ItemCount.Should().Be(0);
        }

        [Fact]
        public void GetStats_ReturnsCorrectSize()
        {
            
            var cache = new LruSizeBasedLogCache(_mockLogger.Object);
            cache.Set("key1", CreateContent("file1.log", 5000));
            cache.Set("key2", CreateContent("file2.log", 3000));

            
            var stats = cache.GetStats();

            
            stats.ItemCount.Should().Be(2);
            stats.TotalSizeBytes.Should().Be(8000);
        }

        [Fact]
        public void GetStats_TracksHitsAndMisses()
        {
            
            var cache = new LruSizeBasedLogCache(_mockLogger.Object);
            cache.Set("key1", CreateContent("file1.log", 1000));

            
            cache.Get("key1"); 
            cache.Get("key1"); 
            cache.Get("nonexistent"); 

            var stats = cache.GetStats();

            
            stats.HitCount.Should().Be(2);
            stats.MissCount.Should().Be(1);
            stats.HitRate.Should().BeApproximately(0.666, 0.01);
        }

        #endregion

        #region Key Generation

        [Fact]
        public void GenerateKey_ExtractsFilename()
        {
            
            var cache = new LruSizeBasedLogCache(_mockLogger.Object);

            
            var key = cache.GenerateKey(123, @"C:\Logs\2026011301_GeneralLog.log");

            
            key.Should().Be("123_2026011301_GeneralLog.log");
        }

        [Fact]
        public void GenerateKey_HandlesUnixPaths()
        {
            
            var cache = new LruSizeBasedLogCache(_mockLogger.Object);

            
            var key = cache.GenerateKey(456, "/var/log/2026011302_ErrorLog.log");

            
            key.Should().Be("456_2026011302_ErrorLog.log");
        }

        #endregion

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

        #endregion
    }
}
