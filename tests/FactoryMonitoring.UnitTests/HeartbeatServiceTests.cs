using FactoryMonitoringWeb.Exceptions;
using FactoryMonitoringWeb.Models;
using FactoryMonitoringWeb.Models.DTOs;
using FactoryMonitoringWeb.Repositories;
using FactoryMonitoringWeb.Services;
using FluentAssertions;
using Microsoft.Extensions.Logging;
using Moq;

namespace FactoryMonitoring.UnitTests
{
    /// <summary>
    /// Unit tests for HeartbeatService.
    /// 
    /// Tests verify:
    /// 1. PC heartbeat status updates correctly
    /// 2. Pending commands are fetched and marked correctly
    /// 3. Concurrent access patterns are handled
    /// 4. Error conditions are handled properly
    /// </summary>
    public class HeartbeatServiceTests
    {
        private readonly Mock<IFactoryPCRepository> _mockPCRepository;
        private readonly Mock<IAgentCommandRepository> _mockCommandRepository;
        private readonly Mock<ILogger<HeartbeatService>> _mockLogger;
        private readonly HeartbeatService _service;

        public HeartbeatServiceTests()
        {
            _mockPCRepository = new Mock<IFactoryPCRepository>();
            _mockCommandRepository = new Mock<IAgentCommandRepository>();
            _mockLogger = new Mock<ILogger<HeartbeatService>>();
            _service = new HeartbeatService(
                _mockPCRepository.Object,
                _mockCommandRepository.Object,
                _mockLogger.Object);
        }

        #region Successful Heartbeat Tests

        [Fact]
        public async Task ProcessHeartbeatAsync_ValidPC_UpdatesStatusAndReturnsSuccess()
        {
            // Arrange
            var request = new HeartbeatRequest { PCId = 1, IsApplicationRunning = true };
            var existingPC = new FactoryPC
            {
                PCId = 1,
                IsOnline = false,
                IsApplicationRunning = false,
                LastHeartbeat = DateTime.Now.AddMinutes(-5)
            };

            _mockPCRepository
                .Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
                .ReturnsAsync(existingPC);

            _mockPCRepository
                .Setup(r => r.UpdateAsync(It.IsAny<FactoryPC>(), It.IsAny<CancellationToken>()))
                .Returns(Task.CompletedTask);

            _mockCommandRepository
                .Setup(r => r.GetPendingCommandsAsync(1, It.IsAny<IEnumerable<string>>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(new List<AgentCommand>());

            // Act
            var result = await _service.ProcessHeartbeatAsync(request);

            // Assert
            result.Should().NotBeNull();
            result.Success.Should().BeTrue();
            result.HasPendingCommands.Should().BeFalse();
            result.Commands.Should().BeEmpty();

            // Verify PC was updated with correct values
            _mockPCRepository.Verify(
                r => r.UpdateAsync(It.Is<FactoryPC>(pc =>
                    pc.IsOnline == true &&
                    pc.IsApplicationRunning == true &&
                    pc.LastHeartbeat > DateTime.Now.AddSeconds(-5)),
                    It.IsAny<CancellationToken>()),
                Times.Once);
        }

        [Fact]
        public async Task ProcessHeartbeatAsync_WithPendingCommands_ReturnsCommandsAndMarksInProgress()
        {
            // Arrange
            var request = new HeartbeatRequest { PCId = 1, IsApplicationRunning = true };
            var existingPC = new FactoryPC { PCId = 1 };

            var pendingCommands = new List<AgentCommand>
            {
                new AgentCommand { CommandId = 100, CommandType = "UpdateConfig", CommandData = "{}" },
                new AgentCommand { CommandId = 101, CommandType = "ChangeModel", CommandData = "{}" }
            };

            _mockPCRepository
                .Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
                .ReturnsAsync(existingPC);

            _mockPCRepository
                .Setup(r => r.UpdateAsync(It.IsAny<FactoryPC>(), It.IsAny<CancellationToken>()))
                .Returns(Task.CompletedTask);

            _mockCommandRepository
                .Setup(r => r.GetPendingCommandsAsync(1, It.IsAny<IEnumerable<string>>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(pendingCommands);

            _mockCommandRepository
                .Setup(r => r.MarkCommandsInProgressAsync(It.IsAny<IEnumerable<int>>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(2);

            // Act
            var result = await _service.ProcessHeartbeatAsync(request);

            // Assert
            result.Should().NotBeNull();
            result.Success.Should().BeTrue();
            result.HasPendingCommands.Should().BeTrue();
            result.Commands.Should().HaveCount(2);
            result.Commands[0].CommandId.Should().Be(100);
            result.Commands[1].CommandId.Should().Be(101);

            // Verify commands were marked as in-progress
            _mockCommandRepository.Verify(
                r => r.MarkCommandsInProgressAsync(
                    It.Is<IEnumerable<int>>(ids => ids.Contains(100) && ids.Contains(101)),
                    It.IsAny<CancellationToken>()),
                Times.Once);
        }

        [Fact]
        public async Task ProcessHeartbeatAsync_ExcludesWebSocketCommands()
        {
            // Arrange
            var request = new HeartbeatRequest { PCId = 1, IsApplicationRunning = true };
            var existingPC = new FactoryPC { PCId = 1 };

            _mockPCRepository
                .Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
                .ReturnsAsync(existingPC);

            _mockPCRepository
                .Setup(r => r.UpdateAsync(It.IsAny<FactoryPC>(), It.IsAny<CancellationToken>()))
                .Returns(Task.CompletedTask);

            _mockCommandRepository
                .Setup(r => r.GetPendingCommandsAsync(1, It.IsAny<IEnumerable<string>>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(new List<AgentCommand>());

            // Act
            await _service.ProcessHeartbeatAsync(request);

            // Assert - Verify GetLogFileContent is excluded
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
        public async Task ProcessHeartbeatAsync_UnknownPC_ThrowsAgentNotFoundException()
        {
            // Arrange
            var request = new HeartbeatRequest { PCId = 999, IsApplicationRunning = true };

            _mockPCRepository
                .Setup(r => r.GetByIdAsync(999, It.IsAny<CancellationToken>()))
                .ReturnsAsync((FactoryPC?)null);

            // Act
            var act = () => _service.ProcessHeartbeatAsync(request);

            // Assert
            await act.Should().ThrowAsync<AgentNotFoundException>()
                .Where(ex => ex.PCId == 999);
        }

        [Fact]
        public async Task ProcessHeartbeatAsync_NullRequest_ThrowsArgumentNullException()
        {
            // Act
            var act = () => _service.ProcessHeartbeatAsync(null!);

            // Assert
            await act.Should().ThrowAsync<ArgumentNullException>();
        }

        [Fact]
        public async Task ProcessHeartbeatAsync_RepositoryException_RethrowsAsIs()
        {
            // Arrange
            var request = new HeartbeatRequest { PCId = 1, IsApplicationRunning = true };
            var repoException = new RepositoryException("FactoryPC", "GetById", "DB timeout");

            _mockPCRepository
                .Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
                .ThrowsAsync(repoException);

            // Act
            var act = () => _service.ProcessHeartbeatAsync(request);

            // Assert - RepositoryException should be re-thrown
            await act.Should().ThrowAsync<RepositoryException>()
                .Where(ex => ex.Operation == "GetById");
        }

        #endregion

        #region Concurrency Tests

        [Fact]
        public async Task ProcessHeartbeatAsync_PartialMarkInProgress_CompletesSuccessfully()
        {
            // Arrange - Simulates race condition where only some commands were marked
            var request = new HeartbeatRequest { PCId = 1, IsApplicationRunning = true };
            var existingPC = new FactoryPC { PCId = 1 };

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
                .Setup(r => r.UpdateAsync(It.IsAny<FactoryPC>(), It.IsAny<CancellationToken>()))
                .Returns(Task.CompletedTask);

            _mockCommandRepository
                .Setup(r => r.GetPendingCommandsAsync(1, It.IsAny<IEnumerable<string>>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(pendingCommands);

            // Only 2 of 3 were marked (simulates another request claimed one)
            _mockCommandRepository
                .Setup(r => r.MarkCommandsInProgressAsync(It.IsAny<IEnumerable<int>>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(2);

            // Act
            var result = await _service.ProcessHeartbeatAsync(request);

            // Assert - Service should complete successfully even with partial mark
            result.Should().NotBeNull();
            result.Success.Should().BeTrue();
            result.Commands.Should().HaveCount(3); // All commands returned (agent will try to execute)
        }

        #endregion
    }
}
