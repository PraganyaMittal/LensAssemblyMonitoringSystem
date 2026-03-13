using FactoryMonitoringWeb.Commands.Config;
using FactoryMonitoringWeb.Commands.Config.Handlers;
using FactoryMonitoringWeb.Queries.Config;
using FactoryMonitoringWeb.Queries.Config.Handlers;
using FactoryMonitoringWeb.Data.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Logging;
using Moq;

namespace FactoryMonitoring.UnitTests
{
    /// <summary>
    /// Unit tests for Config CQRS handlers.
    /// 
    /// Tests verify:
    /// 1. SyncConfigHandler correctly upserts config (Command/Write side)
    /// 2. GetPendingConfigHandler correctly queries pending updates (Query/Read side)
    /// 3. Error handling for both sides
    /// </summary>
    public class ConfigCqrsTests
    {
        private readonly Mock<IConfigRepository> _mockConfigRepository;
        private readonly Mock<ILogger<SyncConfigHandler>> _mockSyncLogger;
        private readonly Mock<ILogger<GetPendingConfigHandler>> _mockQueryLogger;

        public ConfigCqrsTests()
        {
            _mockConfigRepository = new Mock<IConfigRepository>();
            _mockSyncLogger = new Mock<ILogger<SyncConfigHandler>>();
            _mockQueryLogger = new Mock<ILogger<GetPendingConfigHandler>>();
        }

        #region SyncConfigHandler Tests (Command / Write Side)

        [Fact]
        public async Task SyncConfigHandler_NewConfig_ReturnsSuccess()
        {
            // Arrange
            var handler = new SyncConfigHandler(_mockConfigRepository.Object, _mockSyncLogger.Object);
            var command = new SyncConfigCommand(1, "config content here");

            _mockConfigRepository
                .Setup(r => r.UpsertConfigAsync(1, "config content here", It.IsAny<CancellationToken>()))
                .ReturnsAsync(ConfigUpsertResult.Created(100));

            // Act
            var result = await handler.HandleAsync(command);

            // Assert
            result.Should().NotBeNull();
            result.Success.Should().BeTrue();
            result.PendingUpdateCleared.Should().BeFalse();
        }

        [Fact]
        public async Task SyncConfigHandler_ExistingConfigWithPendingUpdate_ClearsPendingFlag()
        {
            // Arrange
            var handler = new SyncConfigHandler(_mockConfigRepository.Object, _mockSyncLogger.Object);
            var command = new SyncConfigCommand(1, "new config from agent");

            _mockConfigRepository
                .Setup(r => r.UpsertConfigAsync(1, "new config from agent", It.IsAny<CancellationToken>()))
                .ReturnsAsync(ConfigUpsertResult.Updated(100, pendingCleared: true));

            // Act
            var result = await handler.HandleAsync(command);

            // Assert
            result.Should().NotBeNull();
            result.Success.Should().BeTrue();
            result.PendingUpdateCleared.Should().BeTrue();
            result.Message.Should().Contain("pending update cleared");
        }

        [Fact]
        public async Task SyncConfigHandler_RepositoryException_ReturnsFailure()
        {
            // Arrange
            var handler = new SyncConfigHandler(_mockConfigRepository.Object, _mockSyncLogger.Object);
            var command = new SyncConfigCommand(1, "config content");

            _mockConfigRepository
                .Setup(r => r.UpsertConfigAsync(1, It.IsAny<string>(), It.IsAny<CancellationToken>()))
                .ThrowsAsync(new InvalidOperationException("Database error"));

            // Act
            var result = await handler.HandleAsync(command);

            // Assert
            result.Should().NotBeNull();
            result.Success.Should().BeFalse();
            result.Message.Should().Contain("Database error");
        }

        [Fact]
        public void SyncConfigCommand_InvalidPCId_ThrowsArgumentException()
        {
            // Act & Assert
            var act = () => new SyncConfigCommand(0, "content");
            act.Should().Throw<ArgumentException>()
                .WithMessage("*MC ID*positive*");
        }

        [Fact]
        public void SyncConfigCommand_NullContent_ThrowsArgumentNullException()
        {
            // Act & Assert
            var act = () => new SyncConfigCommand(1, null!);
            act.Should().Throw<ArgumentNullException>();
        }

        #endregion

        #region GetPendingConfigHandler Tests (Query / Read Side)

        [Fact]
        public async Task GetPendingConfigHandler_NoPending_ReturnsNoPending()
        {
            // Arrange
            var handler = new GetPendingConfigHandler(_mockConfigRepository.Object, _mockQueryLogger.Object);
            var query = new GetPendingConfigQuery(1);

            _mockConfigRepository
                .Setup(r => r.GetPendingUpdateAsync(1, It.IsAny<CancellationToken>()))
                .ReturnsAsync((PendingConfigUpdate?)null);

            // Act
            var result = await handler.HandleAsync(query);

            // Assert
            result.Should().NotBeNull();
            result.Success.Should().BeTrue();
            result.HasPendingUpdate.Should().BeFalse();
            result.UpdatedContent.Should().BeNull();
        }

        [Fact]
        public async Task GetPendingConfigHandler_HasPending_ReturnsContent()
        {
            // Arrange
            var handler = new GetPendingConfigHandler(_mockConfigRepository.Object, _mockQueryLogger.Object);
            var query = new GetPendingConfigQuery(1);
            var requestTime = DateTime.Now.AddMinutes(-5);

            _mockConfigRepository
                .Setup(r => r.GetPendingUpdateAsync(1, It.IsAny<CancellationToken>()))
                .ReturnsAsync(new PendingConfigUpdate
                {
                    UpdatedContent = "new config from operator",
                    RequestTime = requestTime
                });

            // Act
            var result = await handler.HandleAsync(query);

            // Assert
            result.Should().NotBeNull();
            result.Success.Should().BeTrue();
            result.HasPendingUpdate.Should().BeTrue();
            result.UpdatedContent.Should().Be("new config from operator");
            result.UpdateRequestTime.Should().Be(requestTime);
        }

        [Fact]
        public async Task GetPendingConfigHandler_RepositoryException_ReturnsFailure()
        {
            // Arrange
            var handler = new GetPendingConfigHandler(_mockConfigRepository.Object, _mockQueryLogger.Object);
            var query = new GetPendingConfigQuery(1);

            _mockConfigRepository
                .Setup(r => r.GetPendingUpdateAsync(1, It.IsAny<CancellationToken>()))
                .ThrowsAsync(new InvalidOperationException("Query failed"));

            // Act
            var result = await handler.HandleAsync(query);

            // Assert
            result.Should().NotBeNull();
            result.Success.Should().BeFalse();
            result.Message.Should().Contain("Query failed");
        }

        [Fact]
        public void GetPendingConfigQuery_InvalidPCId_ThrowsArgumentException()
        {
            // Act & Assert
            var act = () => new GetPendingConfigQuery(-1);
            act.Should().Throw<ArgumentException>()
                .WithMessage("*MC ID*positive*");
        }

        #endregion
    }
}
