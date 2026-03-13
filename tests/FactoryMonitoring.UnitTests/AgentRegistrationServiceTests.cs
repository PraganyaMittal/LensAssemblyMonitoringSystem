using FactoryMonitoringWeb.Exceptions;
using FactoryMonitoringWeb.Models;
using FactoryMonitoringWeb.Models.DTOs;
using FactoryMonitoringWeb.Data.Repositories;
using FactoryMonitoringWeb.Services;
using FluentAssertions;
using Microsoft.Extensions.Logging;
using Moq;

namespace FactoryMonitoring.UnitTests
{
    /// <summary>
    /// Unit tests for AgentRegistrationService.
    /// 
    /// Tests demonstrate that the new architecture is testable:
    /// 1. Repository is mocked - no database required
    /// 2. Logger is mocked - no log file required
    /// 3. Service can be tested in isolation
    /// 
    /// Test naming: MethodName_Scenario_ExpectedResult
    /// </summary>
    public class AgentRegistrationServiceTests
    {
        private readonly Mock<IFactoryMCRepository> _mockRepository;
        private readonly Mock<ILogger<AgentRegistrationService>> _mockLogger;
        private readonly AgentRegistrationService _service;

        public AgentRegistrationServiceTests()
        {
            _mockRepository = new Mock<IFactoryMCRepository>();
            _mockLogger = new Mock<ILogger<AgentRegistrationService>>();
            _service = new AgentRegistrationService(_mockRepository.Object, _mockLogger.Object);
        }

        #region Successful Registration Tests

        [Fact]
        public async Task RegisterAgentAsync_NewAgent_CreatesAndReturnsSuccess()
        {
            // Arrange
            var request = CreateValidRequest();
            
            _mockRepository
                .Setup(r => r.FindByLineAndPCAsync(
                    request.LineNumber,
                    request.PCNumber,
                    request.ModelVersion,
                    It.IsAny<CancellationToken>()))
                .ReturnsAsync((FactoryMC?)null); // Agent doesn't exist

            _mockRepository
                .Setup(r => r.AddAsync(It.IsAny<FactoryMC>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync((FactoryMC pc, CancellationToken _) =>
                {
                    pc.MCId = 42; // Simulate ID assignment
                    return pc;
                });

            // Act
            var result = await _service.RegisterAgentAsync(request);

            // Assert
            result.Should().NotBeNull();
            result.Success.Should().BeTrue();
            result.MCId.Should().Be(42);
            result.IsNewRegistration.Should().BeTrue();
            result.Message.Should().Contain("Registration successful");

            _mockRepository.Verify(
                r => r.AddAsync(It.Is<FactoryMC>(pc =>
                    pc.LineNumber == request.LineNumber &&
                    pc.MCNumber == request.PCNumber &&
                    pc.IsOnline == true),
                    It.IsAny<CancellationToken>()),
                Times.Once);
        }

        [Fact]
        public async Task RegisterAgentAsync_ExistingAgent_UpdatesAndReturnsSuccess()
        {
            // Arrange
            var request = CreateValidRequest();
            var existingPC = new FactoryMC
            {
                MCId = 123,
                LineNumber = request.LineNumber,
                MCNumber = request.PCNumber,
                ModelVersion = request.ModelVersion,
                IsOnline = false,
                IPAddress = "old.ip.address"
            };

            _mockRepository
                .Setup(r => r.FindByLineAndPCAsync(
                    request.LineNumber,
                    request.PCNumber,
                    request.ModelVersion,
                    It.IsAny<CancellationToken>()))
                .ReturnsAsync(existingPC);

            _mockRepository
                .Setup(r => r.UpdateAsync(It.IsAny<FactoryMC>(), It.IsAny<CancellationToken>()))
                .Returns(Task.CompletedTask);

            // Act
            var result = await _service.RegisterAgentAsync(request);

            // Assert
            result.Should().NotBeNull();
            result.Success.Should().BeTrue();
            result.MCId.Should().Be(123);
            result.IsNewRegistration.Should().BeFalse();
            result.Message.Should().Contain("Re-registration successful");

            _mockRepository.Verify(
                r => r.UpdateAsync(It.Is<FactoryMC>(pc =>
                    pc.MCId == 123 &&
                    pc.IPAddress == request.IPAddress &&
                    pc.IsOnline == true),
                    It.IsAny<CancellationToken>()),
                Times.Once);
        }

        #endregion

        #region Validation Tests

        [Fact]
        public async Task RegisterAgentAsync_InvalidLineNumber_ThrowsValidationException()
        {
            // Arrange
            var request = CreateValidRequest();
            request.LineNumber = 0; // Invalid

            // Act
            var act = () => _service.RegisterAgentAsync(request);

            // Assert
            await act.Should().ThrowAsync<DomainValidationException>()
                .Where(ex => ex.ValidationErrors.ContainsKey("LineNumber"));
        }

        [Fact]
        public async Task RegisterAgentAsync_InvalidPCNumber_ThrowsValidationException()
        {
            // Arrange
            var request = CreateValidRequest();
            request.PCNumber = 10001; // Too high

            // Act
            var act = () => _service.RegisterAgentAsync(request);

            // Assert
            await act.Should().ThrowAsync<DomainValidationException>()
                .Where(ex => ex.ValidationErrors.ContainsKey("PCNumber"));
        }

        [Fact]
        public async Task RegisterAgentAsync_MissingIPAddress_ThrowsValidationException()
        {
            // Arrange
            var request = CreateValidRequest();
            request.IPAddress = ""; // Empty

            // Act
            var act = () => _service.RegisterAgentAsync(request);

            // Assert
            await act.Should().ThrowAsync<DomainValidationException>()
                .Where(ex => ex.ValidationErrors.ContainsKey("IPAddress"));
        }

        [Fact]
        public async Task RegisterAgentAsync_NullRequest_ThrowsArgumentNullException()
        {
            // Act
            var act = () => _service.RegisterAgentAsync(null!);

            // Assert
            await act.Should().ThrowAsync<ArgumentNullException>();
        }

        #endregion

        #region Repository Error Tests

        [Fact]
        public async Task RegisterAgentAsync_RepositoryThrowsException_WrapsInRegistrationFailedException()
        {
            // Arrange
            var request = CreateValidRequest();
            
            _mockRepository
                .Setup(r => r.FindByLineAndPCAsync(
                    It.IsAny<int>(),
                    It.IsAny<int>(),
                    It.IsAny<string>(),
                    It.IsAny<CancellationToken>()))
                .ThrowsAsync(new InvalidOperationException("Database connection failed"));

            // Act
            var act = () => _service.RegisterAgentAsync(request);

            // Assert
            await act.Should().ThrowAsync<RegistrationFailedException>()
                .Where(ex =>
                    ex.LineNumber == request.LineNumber &&
                    ex.PCNumber == request.PCNumber);
        }

        [Fact]
        public async Task RegisterAgentAsync_RepositoryExceptionPreserved_WhenRepositoryExceptionThrown()
        {
            // Arrange
            var request = CreateValidRequest();
            var repoException = new RepositoryException(
                entityType: "FactoryMC",
                operation: "Find",
                reason: "Database timeout");

            _mockRepository
                .Setup(r => r.FindByLineAndPCAsync(
                    It.IsAny<int>(),
                    It.IsAny<int>(),
                    It.IsAny<string>(),
                    It.IsAny<CancellationToken>()))
                .ThrowsAsync(repoException);

            // Act
            var act = () => _service.RegisterAgentAsync(request);

            // Assert - RepositoryException should be re-thrown as-is
            await act.Should().ThrowAsync<RepositoryException>()
                .Where(ex => ex.Operation == "Find");
        }

        #endregion

        #region Helper Methods

        private static AgentRegistrationRequest CreateValidRequest()
        {
            return new AgentRegistrationRequest
            {
                LineNumber = 1,
                PCNumber = 1,
                IPAddress = "192.168.1.100",
                ConfigFilePath = @"C:\test\config.ini",
                LogFolderPath = @"C:\test\logs",
                ModelFolderPath = @"C:\test\models",
                ModelVersion = "3.5"
            };
        }

        #endregion
    }
}
