using FactoryMonitoringWeb.Commands;
using FactoryMonitoringWeb.Commands.Agent;
using FactoryMonitoringWeb.Models;
using FactoryMonitoringWeb.Models.DTOs;
using FactoryMonitoringWeb.Data.Repositories;
using FactoryMonitoringWeb.Services;
using FactoryMonitoringWeb.Services.Interfaces;
using FluentAssertions;
using Microsoft.Extensions.Logging;
using Moq;
using System.Collections.Concurrent;
using System.Diagnostics;

namespace FactoryMonitoring.UnitTests
{
    /// <summary>
    /// Load tests for heartbeat processing.
    /// 
    /// Tests verify:
    /// 1. 500 concurrent heartbeats complete successfully
    /// 2. No race conditions in command fetching
    /// 3. Performance under load
    /// </summary>
    public class HeartbeatLoadTests
    {
        private readonly Mock<IFactoryMCRepository> _mockPcRepo;
        private readonly Mock<IAgentCommandRepository> _mockCommandRepo;
        private readonly Mock<ILogger<HeartbeatServiceTests>> _mockLogger;

        public HeartbeatLoadTests()
        {
            _mockPcRepo = new Mock<IFactoryMCRepository>();
            _mockCommandRepo = new Mock<IAgentCommandRepository>();
            _mockLogger = new Mock<ILogger<HeartbeatServiceTests>>();
        }

        [Fact]
        public async Task LoadTest_500ConcurrentHeartbeats_AllSucceed()
        {
            // Arrange
            var agentCount = 500;
            var errors = new ConcurrentBag<Exception>();
            var successCount = 0;

            // Setup mock to return valid PCs for all 500 agents
            _mockPcRepo.Setup(r => r.GetByIdAsync(It.IsAny<int>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync((int id, CancellationToken ct) => new FactoryMC
                {
                    MCId = id,
                    LineNumber = 1,
                    MCNumber = id,
                    IPAddress = "127.0.0.1"
                });

            _mockPcRepo.Setup(r => r.UpdateAsync(It.IsAny<FactoryMC>(), It.IsAny<CancellationToken>()))
                .Returns(Task.CompletedTask);

            _mockCommandRepo.Setup(r => r.GetPendingCommandsAsync(
                It.IsAny<int>(), It.IsAny<IEnumerable<string>?>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(new List<AgentCommand>());

            var service = new FactoryMonitoringWeb.Services.HeartbeatService(
                _mockPcRepo.Object,
                _mockCommandRepo.Object,
                Mock.Of<ILogger<FactoryMonitoringWeb.Services.HeartbeatService>>());

            var stopwatch = Stopwatch.StartNew();

            // Act - 500 concurrent heartbeats
            var tasks = Enumerable.Range(1, agentCount).Select(async mcId =>
            {
                try
                {
                    var request = new HeartbeatRequest
                    {
                        MCId = mcId,
                        IsApplicationRunning = true
                    };

                    var result = await service.ProcessHeartbeatAsync(request);
                    
                    if (result.Success)
                    {
                        Interlocked.Increment(ref successCount);
                    }
                }
                catch (Exception ex)
                {
                    errors.Add(ex);
                }
            });

            await Task.WhenAll(tasks);
            stopwatch.Stop();

            // Assert
            errors.Should().BeEmpty("All heartbeats should succeed without errors");
            successCount.Should().Be(agentCount);

            // Performance check: 500 heartbeats should complete in <5 seconds
            stopwatch.ElapsedMilliseconds.Should().BeLessThan(5000,
                $"500 heartbeats should complete quickly. Actual: {stopwatch.ElapsedMilliseconds}ms");
        }

        [Fact]
        public async Task LoadTest_500Heartbeats_NoDuplicateCommandProcessing()
        {
            // Arrange - Each PC has pending commands
            var processedCommands = new ConcurrentDictionary<int, int>();

            _mockPcRepo.Setup(r => r.GetByIdAsync(It.IsAny<int>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync((int id, CancellationToken ct) => new FactoryPC
                {
                    PCId = id,
                    LineNumber = 1,
                    PCNumber = id,
                    IPAddress = "127.0.0.1"
                });

            _mockPcRepo.Setup(r => r.UpdateAsync(It.IsAny<FactoryPC>(), It.IsAny<CancellationToken>()))
                .Returns(Task.CompletedTask);

            _mockCommandRepo.Setup(r => r.GetPendingCommandsAsync(
                It.IsAny<int>(), It.IsAny<IEnumerable<string>?>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync((int mcId, IEnumerable<string>? excluded, CancellationToken ct) =>
                {
                    // Track how many times each PC's commands are fetched
                    processedCommands.AddOrUpdate(mcId, 1, (k, v) => v + 1);
                    
                    return new List<AgentCommand>
                    {
                        new AgentCommand { CommandId = mcId * 100, MCId = mcId, CommandType = "GetLogs", Status = "Pending" }
                    };
                });

            _mockCommandRepo.Setup(r => r.MarkCommandsInProgressAsync(
                It.IsAny<IEnumerable<int>>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(1);

            var service = new FactoryMonitoringWeb.Services.HeartbeatService(
                _mockPcRepo.Object,
                _mockCommandRepo.Object,
                Mock.Of<ILogger<FactoryMonitoringWeb.Services.HeartbeatService>>());

            // Act - 500 heartbeats, one per PC
            var tasks = Enumerable.Range(1, 500).Select(async mcId =>
            {
                var request = new HeartbeatRequest
                {
                    MCId = mcId,
                    IsApplicationRunning = true
                };
                await service.ProcessHeartbeatAsync(request);
            });

            await Task.WhenAll(tasks);

            // Assert - Each PC's commands should be fetched exactly once
            foreach (var kvp in processedCommands)
            {
                kvp.Value.Should().Be(1, $"PC {kvp.Key} commands should be fetched exactly once");
            }
        }

        [Fact]
        public async Task LoadTest_PeakLoadSimulation_RotationInterval()
        {
            // Arrange - Simulate all 500 agents syncing in 5-second window
            var agentCount = 500;
            var syncWindowMs = 5000; // 5 seconds (simulated rotation interval peak)
            var completedCount = 0;
            var latencies = new ConcurrentBag<long>();

            _mockPcRepo.Setup(r => r.GetByIdAsync(It.IsAny<int>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync((int id, CancellationToken ct) => new FactoryMC
                {
                    MCId = id,
                    LineNumber = 1,
                    MCNumber = id,
                    IPAddress = "127.0.0.1"
                });

            _mockPcRepo.Setup(r => r.UpdateAsync(It.IsAny<FactoryMC>(), It.IsAny<CancellationToken>()))
                .Returns(Task.CompletedTask);

            _mockCommandRepo.Setup(r => r.GetPendingCommandsAsync(
                It.IsAny<int>(), It.IsAny<IEnumerable<string>?>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(new List<AgentCommand>());

            var service = new FactoryMonitoringWeb.Services.HeartbeatService(
                _mockPcRepo.Object,
                _mockCommandRepo.Object,
                Mock.Of<ILogger<FactoryMonitoringWeb.Services.HeartbeatService>>());

            var overallStopwatch = Stopwatch.StartNew();

            // Act - Burst of 500 heartbeats
            var tasks = Enumerable.Range(1, agentCount).Select(async mcId =>
            {
                var sw = Stopwatch.StartNew();
                
                await service.ProcessHeartbeatAsync(new HeartbeatRequest
                {
                    MCId = mcId,
                    IsApplicationRunning = true
                });
                
                sw.Stop();
                latencies.Add(sw.ElapsedMilliseconds);
                Interlocked.Increment(ref completedCount);
            });

            await Task.WhenAll(tasks);
            overallStopwatch.Stop();

            // Assert
            completedCount.Should().Be(agentCount);

            // All should complete within the sync window
            overallStopwatch.ElapsedMilliseconds.Should().BeLessThan(syncWindowMs,
                "All heartbeats should complete within rotation interval");

            // Calculate latency stats
            var avgLatency = latencies.Average();
            var maxLatency = latencies.Max();
            var p95Latency = latencies.OrderBy(l => l).Skip((int)(latencies.Count * 0.95)).First();

            // Performance expectations
            avgLatency.Should().BeLessThan(50, "Average latency should be <50ms");
            p95Latency.Should().BeLessThan(100, "P95 latency should be <100ms");
        }
    }
}
