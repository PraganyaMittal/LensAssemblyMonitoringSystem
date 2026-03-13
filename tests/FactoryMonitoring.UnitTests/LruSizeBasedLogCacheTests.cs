using FactoryMonitoringWeb.Services;
using FactoryMonitoringWeb.Services.Interfaces;
using FactoryMonitoringWeb.Models.DTOs;
using FluentAssertions;
using Microsoft.Extensions.Logging;
using Moq;

namespace FactoryMonitoring.UnitTests
{
    /// <summary>
    /// Unit tests for LruSizeBasedLogCache.
    /// 
    /// Tests verify:
    /// 1. LRU eviction order (least recently used first)
    /// 2. Size-based eviction (100MB limit)
    /// 3. Cache hits update LRU position
    /// 4. Key generation from file paths
    /// </summary>
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
            // Arrange
            var cache = new LruSizeBasedLogCache(_mockLogger.Object);

            // Act
            var result = cache.Get("nonexistent");

            // Assert
            result.Should().BeNull();
        }

        [Fact]
        public void Set_And_Get_ReturnsCorrectValue()
        {
            // Arrange
            var cache = new LruSizeBasedLogCache(_mockLogger.Object);
            var content = CreateContent("test.log", 1000);

            // Act
            cache.Set("key1", content);
            var result = cache.Get("key1");

            // Assert
            result.Should().NotBeNull();
            result!.FileName.Should().Be("test.log");
            result.CompressedSize.Should().Be(1000);
        }

        [Fact]
        public void Remove_ExistingKey_ReturnsTrue()
        {
            // Arrange
            var cache = new LruSizeBasedLogCache(_mockLogger.Object);
            cache.Set("key1", CreateContent("test.log", 1000));

            // Act
            var removed = cache.Remove("key1");
            var afterRemove = cache.Get("key1");

            // Assert
            removed.Should().BeTrue();
            afterRemove.Should().BeNull();
        }

        #endregion

        #region LRU Eviction

        [Fact]
        public void Eviction_RemovesLeastRecentlyUsed()
        {
            // Arrange - 10KB limit, 3x4KB items = 12KB (needs eviction)
            var cache = new LruSizeBasedLogCache(_mockLogger.Object, maxSizeBytes: 10 * 1024);

            cache.Set("key1", CreateContent("file1.log", 4000)); // 4KB
            cache.Set("key2", CreateContent("file2.log", 4000)); // 4KB
            // key1 is now LRU

            // Act - adding 4KB more should evict key1
            cache.Set("key3", CreateContent("file3.log", 4000)); // 4KB

            // Assert
            cache.Get("key1").Should().BeNull("key1 should be evicted as LRU");
            cache.Get("key2").Should().NotBeNull("key2 should still exist");
            cache.Get("key3").Should().NotBeNull("key3 should exist");
        }

        [Fact]
        public void Get_UpdatesLRUPosition()
        {
            // Arrange - 10KB limit
            var cache = new LruSizeBasedLogCache(_mockLogger.Object, maxSizeBytes: 10 * 1024);

            cache.Set("key1", CreateContent("file1.log", 4000)); // 4KB
            cache.Set("key2", CreateContent("file2.log", 4000)); // 4KB

            // Access key1 to move it to front of LRU list
            cache.Get("key1");

            // Act - adding 4KB more should evict key2 (now LRU, not key1)
            cache.Set("key3", CreateContent("file3.log", 4000)); // 4KB

            // Assert
            cache.Get("key1").Should().NotBeNull("key1 was recently accessed");
            cache.Get("key2").Should().BeNull("key2 should be evicted as LRU");
            cache.Get("key3").Should().NotBeNull("key3 should exist");
        }

        #endregion

        #region Size-Based Eviction

        [Fact]
        public void Set_ItemLargerThanMax_DoesNotCache()
        {
            // Arrange - 1KB limit, try to cache 2KB
            var cache = new LruSizeBasedLogCache(_mockLogger.Object, maxSizeBytes: 1024);

            // Act
            cache.Set("key1", CreateContent("large.log", 2048)); // 2KB

            // Assert
            cache.Get("key1").Should().BeNull("item too large to cache");
            cache.GetStats().ItemCount.Should().Be(0);
        }

        [Fact]
        public void GetStats_ReturnsCorrectSize()
        {
            // Arrange
            var cache = new LruSizeBasedLogCache(_mockLogger.Object);
            cache.Set("key1", CreateContent("file1.log", 5000));
            cache.Set("key2", CreateContent("file2.log", 3000));

            // Act
            var stats = cache.GetStats();

            // Assert
            stats.ItemCount.Should().Be(2);
            stats.TotalSizeBytes.Should().Be(8000);
        }

        [Fact]
        public void GetStats_TracksHitsAndMisses()
        {
            // Arrange
            var cache = new LruSizeBasedLogCache(_mockLogger.Object);
            cache.Set("key1", CreateContent("file1.log", 1000));

            // Act
            cache.Get("key1"); // hit
            cache.Get("key1"); // hit
            cache.Get("nonexistent"); // miss

            var stats = cache.GetStats();

            // Assert
            stats.HitCount.Should().Be(2);
            stats.MissCount.Should().Be(1);
            stats.HitRate.Should().BeApproximately(0.666, 0.01);
        }

        #endregion

        #region Key Generation

        [Fact]
        public void GenerateKey_ExtractsFilename()
        {
            // Arrange
            var cache = new LruSizeBasedLogCache(_mockLogger.Object);

            // Act
            var key = cache.GenerateKey(123, @"C:\Logs\2026011301_GeneralLog.log");

            // Assert
            key.Should().Be("123_2026011301_GeneralLog.log");
        }

        [Fact]
        public void GenerateKey_HandlesUnixPaths()
        {
            // Arrange
            var cache = new LruSizeBasedLogCache(_mockLogger.Object);

            // Act
            var key = cache.GenerateKey(456, "/var/log/2026011302_ErrorLog.log");

            // Assert
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
