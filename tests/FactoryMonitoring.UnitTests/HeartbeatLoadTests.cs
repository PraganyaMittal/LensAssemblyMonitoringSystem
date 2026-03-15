using FactoryMonitoringWeb.Commands;
using FactoryMonitoringWeb.Commands.Agent;
using FactoryMonitoringWeb.Models;
using FactoryMonitoringWeb.Models.DTOs;
using FactoryMonitoringWeb.Data.Repositories;
using FactoryMonitoringWeb.Services;
using FactoryMonitoringWeb.Controllers.Hubs;
using FluentAssertions;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using Moq;
using System.Collections.Concurrent;
using System.Diagnostics;

namespace FactoryMonitoring.UnitTests
{
    
    
    
    
    
    
    
    
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
            
            var agentCount = 500;
            var errors = new ConcurrentBag<Exception>();
            var successCount = 0;

            
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

            var service = CreateHeartbeatService();

            var stopwatch = Stopwatch.StartNew();

            
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

            
            errors.Should().BeEmpty("All heartbeats should succeed without errors");
            successCount.Should().Be(agentCount);

            
            stopwatch.ElapsedMilliseconds.Should().BeLessThan(5000,
                $"500 heartbeats should complete quickly. Actual: {stopwatch.ElapsedMilliseconds}ms");
        }

        [Fact]
        public async Task LoadTest_500Heartbeats_NoDuplicateCommandProcessing()
        {
            
            var processedCommands = new ConcurrentDictionary<int, int>();

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
                .ReturnsAsync((int mcId, IEnumerable<string>? excluded, CancellationToken ct) =>
                {
                    
                    processedCommands.AddOrUpdate(mcId, 1, (k, v) => v + 1);
                    
                    return new List<AgentCommand>
                    {
                        new AgentCommand { CommandId = mcId * 100, MCId = mcId, CommandType = "GetLogs", Status = "Pending" }
                    };
                });

            _mockCommandRepo.Setup(r => r.MarkCommandsInProgressAsync(
                It.IsAny<IEnumerable<int>>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(1);

            var service = CreateHeartbeatService();

            
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

            
            foreach (var kvp in processedCommands)
            {
                kvp.Value.Should().Be(1, $"PC {kvp.Key} commands should be fetched exactly once");
            }
        }

        [Fact]
        public async Task LoadTest_PeakLoadSimulation_RotationInterval()
        {
            
            var agentCount = 500;
            var syncWindowMs = 5000; 
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

            var service = CreateHeartbeatService();

            var overallStopwatch = Stopwatch.StartNew();

            
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

            
            completedCount.Should().Be(agentCount);

            
            overallStopwatch.ElapsedMilliseconds.Should().BeLessThan(syncWindowMs,
                "All heartbeats should complete within rotation interval");

            
            var avgLatency = latencies.Average();
            var maxLatency = latencies.Max();
            var p95Latency = latencies.OrderBy(l => l).Skip((int)(latencies.Count * 0.95)).First();

            
            avgLatency.Should().BeLessThan(50, "Average latency should be <50ms");
            p95Latency.Should().BeLessThan(100, "P95 latency should be <100ms");
        }

        private FactoryMonitoringWeb.Services.HeartbeatService CreateHeartbeatService()
        {
            var mockHubContext = new Mock<IHubContext<AgentHub>>();
            var mockClients = new Mock<IHubClients>();
            var mockAllClients = new Mock<IClientProxy>();
            mockClients.Setup(c => c.All).Returns(mockAllClients.Object);
            mockHubContext.Setup(h => h.Clients).Returns(mockClients.Object);

            return new FactoryMonitoringWeb.Services.HeartbeatService(
                _mockPcRepo.Object,
                _mockCommandRepo.Object,
                Mock.Of<IModelRepository>(),
                Mock.Of<ILogger<FactoryMonitoringWeb.Services.HeartbeatService>>(),
                mockHubContext.Object);
        }
    }
}
