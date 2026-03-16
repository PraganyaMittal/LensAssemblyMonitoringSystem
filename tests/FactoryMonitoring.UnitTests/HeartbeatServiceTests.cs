using FactoryMonitoringWeb.Models.Exceptions;
using FactoryMonitoringWeb.Models;
using FactoryMonitoringWeb.Models.DTOs;
using FactoryMonitoringWeb.Data.Repositories;
using FactoryMonitoringWeb.Services;
using FactoryMonitoringWeb.Controllers.Hubs;
using FluentAssertions;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using Moq;

namespace FactoryMonitoring.UnitTests
{
    
    
    
    
    
    
    
    
    
    public class HeartbeatServiceTests
    {
        private readonly Mock<IFactoryMCRepository> _mockPCRepository;
        private readonly Mock<IAgentCommandRepository> _mockCommandRepository;
        private readonly Mock<IModelRepository> _mockModelRepository;
        private readonly Mock<ILogger<HeartbeatService>> _mockLogger;
        private readonly Mock<IHubContext<AgentHub>> _mockHubContext;
        private readonly HeartbeatService _service;

        public HeartbeatServiceTests()
        {
            _mockPCRepository = new Mock<IFactoryMCRepository>();
            _mockCommandRepository = new Mock<IAgentCommandRepository>();
            _mockModelRepository = new Mock<IModelRepository>();
            _mockLogger = new Mock<ILogger<HeartbeatService>>();
            _mockHubContext = new Mock<IHubContext<AgentHub>>();

            
            var mockClients = new Mock<IHubClients>();
            var mockAllClients = new Mock<IClientProxy>();
            mockClients.Setup(c => c.All).Returns(mockAllClients.Object);
            _mockHubContext.Setup(h => h.Clients).Returns(mockClients.Object);

            _service = new HeartbeatService(
                _mockPCRepository.Object,
                _mockCommandRepository.Object,
                _mockModelRepository.Object,
                _mockLogger.Object,
                _mockHubContext.Object);
        }

        #region Successful Heartbeat Tests

        [Fact]
        public async Task ProcessHeartbeatAsync_ValidPC_UpdatesStatusAndReturnsSuccess()
        {
            
            var request = new HeartbeatRequest { MCId = 1, IsApplicationRunning = true };
            var existingPC = new FactoryMC
            {
                MCId = 1,
                IsOnline = false,
                IsApplicationRunning = false,
                LastHeartbeat = DateTime.Now.AddMinutes(-5)
            };

            _mockPCRepository
                .Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
                .ReturnsAsync(existingPC);

            _mockPCRepository
                .Setup(r => r.UpdateAsync(It.IsAny<FactoryMC>(), It.IsAny<CancellationToken>()))
                .Returns(Task.CompletedTask);

            _mockCommandRepository
                .Setup(r => r.GetPendingCommandsAsync(1, It.IsAny<IEnumerable<string>>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(new List<AgentCommand>());

            
            var result = await _service.ProcessHeartbeatAsync(request);

            
            result.Should().NotBeNull();
            result.Success.Should().BeTrue();
            result.HasPendingCommands.Should().BeFalse();
            result.Commands.Should().BeEmpty();

            
            _mockPCRepository.Verify(
                r => r.UpdateAsync(It.Is<FactoryMC>(pc =>
                    pc.IsOnline == true &&
                    pc.IsApplicationRunning == true &&
                    pc.LastHeartbeat > DateTime.UtcNow.AddSeconds(-5)),
                    It.IsAny<CancellationToken>()),
                Times.Once);
        }

        [Fact]
        public async Task ProcessHeartbeatAsync_WithPendingCommands_ReturnsCommandsAndMarksInProgress()
        {
            
            var request = new HeartbeatRequest { MCId = 1, IsApplicationRunning = true };
            var existingPC = new FactoryMC { MCId = 1 };

            var pendingCommands = new List<AgentCommand>
            {
                new AgentCommand { CommandId = 100, CommandType = "UpdateConfig", CommandData = "{}" },
                new AgentCommand { CommandId = 101, CommandType = "ChangeModel", CommandData = "{}" }
            };

            _mockPCRepository
                .Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
                .ReturnsAsync(existingPC);

            _mockPCRepository
                .Setup(r => r.UpdateAsync(It.IsAny<FactoryMC>(), It.IsAny<CancellationToken>()))
                .Returns(Task.CompletedTask);

            _mockCommandRepository
                .Setup(r => r.GetPendingCommandsAsync(1, It.IsAny<IEnumerable<string>>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(pendingCommands);

            _mockCommandRepository
                .Setup(r => r.MarkCommandsInProgressAsync(It.IsAny<IEnumerable<int>>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(2);

            
            var result = await _service.ProcessHeartbeatAsync(request);

            
            result.Should().NotBeNull();
            result.Success.Should().BeTrue();
            result.HasPendingCommands.Should().BeTrue();
            result.Commands.Should().HaveCount(2);
            result.Commands[0].CommandId.Should().Be(100);
            result.Commands[1].CommandId.Should().Be(101);

            
            _mockCommandRepository.Verify(
                r => r.MarkCommandsInProgressAsync(
                    It.Is<IEnumerable<int>>(ids => ids.Contains(100) && ids.Contains(101)),
                    It.IsAny<CancellationToken>()),
                Times.Once);
        }

        [Fact]
        public async Task ProcessHeartbeatAsync_ExcludesWebSocketCommands()
        {
            
            var request = new HeartbeatRequest { MCId = 1, IsApplicationRunning = true };
            var existingPC = new FactoryMC { MCId = 1 };

            _mockPCRepository
                .Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
                .ReturnsAsync(existingPC);

            _mockPCRepository
                .Setup(r => r.UpdateAsync(It.IsAny<FactoryMC>(), It.IsAny<CancellationToken>()))
                .Returns(Task.CompletedTask);

            _mockCommandRepository
                .Setup(r => r.GetPendingCommandsAsync(1, It.IsAny<IEnumerable<string>>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(new List<AgentCommand>());

            
            await _service.ProcessHeartbeatAsync(request);

            
            _mockCommandRepository.Verify(
                r => r.GetPendingCommandsAsync(
                    1,
                    It.Is<IEnumerable<string>>(types => types.Contains("GetLogFileContent")),
                    It.IsAny<CancellationToken>()),
                Times.Once);
        }

        #endregion

        #region Error Handling Tests

        [Fact]
        public async Task ProcessHeartbeatAsync_UnknownPC_ReturnsResetAgentCommand()
        {
            
            var request = new HeartbeatRequest { MCId = 999, IsApplicationRunning = true };

            _mockPCRepository
                .Setup(r => r.GetByIdAsync(999, It.IsAny<CancellationToken>()))
                .ReturnsAsync((FactoryMC?)null);

            
            var result = await _service.ProcessHeartbeatAsync(request);

            
            result.Should().NotBeNull();
            result.Success.Should().BeTrue();
            result.Commands.Should().HaveCount(1);
            result.Commands[0].CommandType.Should().Be("ResetAgent");
        }

        [Fact]
        public async Task ProcessHeartbeatAsync_NullRequest_ThrowsArgumentNullException()
        {
            
            var act = () => _service.ProcessHeartbeatAsync(null!);

            
            await act.Should().ThrowAsync<ArgumentNullException>();
        }

        [Fact]
        public async Task ProcessHeartbeatAsync_RepositoryException_RethrowsAsIs()
        {
            
            var request = new HeartbeatRequest { MCId = 1, IsApplicationRunning = true };
            var repoException = new RepositoryException("FactoryMC", "GetById", "DB timeout");

            _mockPCRepository
                .Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
                .ThrowsAsync(repoException);

            
            var act = () => _service.ProcessHeartbeatAsync(request);

            
            await act.Should().ThrowAsync<RepositoryException>()
                .Where(ex => ex.Operation == "GetById");
        }

        #endregion

        #region Concurrency Tests

        [Fact]
        public async Task ProcessHeartbeatAsync_PartialMarkInProgress_CompletesSuccessfully()
        {
            
            var request = new HeartbeatRequest { MCId = 1, IsApplicationRunning = true };
            var existingPC = new FactoryMC { MCId = 1 };

            var pendingCommands = new List<AgentCommand>
            {
                new AgentCommand { CommandId = 100, CommandType = "UpdateConfig" },
                new AgentCommand { CommandId = 101, CommandType = "ChangeModel" },
                new AgentCommand { CommandId = 102, CommandType = "DownloadModel" }
            };

            _mockPCRepository
                .Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
                .ReturnsAsync(existingPC);

            _mockPCRepository
                .Setup(r => r.UpdateAsync(It.IsAny<FactoryMC>(), It.IsAny<CancellationToken>()))
                .Returns(Task.CompletedTask);

            _mockCommandRepository
                .Setup(r => r.GetPendingCommandsAsync(1, It.IsAny<IEnumerable<string>>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(pendingCommands);

            
            _mockCommandRepository
                .Setup(r => r.MarkCommandsInProgressAsync(It.IsAny<IEnumerable<int>>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(2);

            
            var result = await _service.ProcessHeartbeatAsync(request);

            
            result.Should().NotBeNull();
            result.Success.Should().BeTrue();
            result.Commands.Should().HaveCount(3); 
        }

        #endregion
    }
}
