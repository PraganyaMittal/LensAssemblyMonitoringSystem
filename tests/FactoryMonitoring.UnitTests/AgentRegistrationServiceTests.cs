using FactoryMonitoringWeb.Models.Exceptions;
using Microsoft.EntityFrameworkCore;
using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Models;
using FactoryMonitoringWeb.Models.DTOs;
using FactoryMonitoringWeb.Data.Repositories;
using FactoryMonitoringWeb.Services;
using FluentAssertions;
using Microsoft.Extensions.Logging;
using Moq;

namespace FactoryMonitoring.UnitTests
{
    
    
    
    
    
    
    
    
    
    
    public class AgentRegistrationServiceTests
    {
        private readonly Mock<IFactoryMCRepository> _mockRepository;
        private readonly FactoryDbContext _context;
        private readonly Mock<ILogger<AgentRegistrationService>> _mockLogger;
        private readonly AgentRegistrationService _service;

        public AgentRegistrationServiceTests()
        {
            var options = new DbContextOptionsBuilder<FactoryDbContext>()
                .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
                .ConfigureWarnings(x => x.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
                .Options;
            _context = new FactoryDbContext(options);
            _mockRepository = new Mock<IFactoryMCRepository>();
            _mockLogger = new Mock<ILogger<AgentRegistrationService>>();
            _service = new AgentRegistrationService(_mockRepository.Object, _context, _mockLogger.Object);
        }

        #region Successful Registration Tests

        [Fact]
        public async Task RegisterAgentAsync_NewAgent_CreatesAndReturnsSuccess()
        {
            
            var request = CreateValidRequest();
            
            _mockRepository
                .Setup(r => r.FindByIpAsync(
                    request.IPAddress,
                    It.IsAny<CancellationToken>()))
                .ReturnsAsync((FactoryMC?)null); 

            _mockRepository
                .Setup(r => r.AddAsync(It.IsAny<FactoryMC>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync((FactoryMC pc, CancellationToken _) =>
                {
                    pc.MCId = 42; 
                    return pc;
                });

            
            var result = await _service.RegisterAgentAsync(request);

            
            result.Should().NotBeNull();
            result.Success.Should().BeTrue();
            result.MCId.Should().Be(42);
            result.IsNewRegistration.Should().BeTrue();
            result.Message.Should().Contain("Registration successful");

            _mockRepository.Verify(
                r => r.AddAsync(It.Is<FactoryMC>(pc =>
                    pc.LineNumber == request.LineNumber &&
                    pc.MCNumber == request.MCNumber &&
                    pc.IsOnline == true),
                    It.IsAny<CancellationToken>()),
                Times.Once);
        }

        [Fact]
        public async Task RegisterAgentAsync_ExistingAgent_UpdatesAndReturnsSuccess()
        {
            
            var request = CreateValidRequest();
            var existingPC = new FactoryMC
            {
                MCId = 123,
                LineNumber = request.LineNumber,
                MCNumber = request.MCNumber,
                ModelVersion = request.ModelVersion,
                IsOnline = false,
                IPAddress = "old.ip.address"
            };

            _mockRepository
                .Setup(r => r.FindByIpAsync(
                    request.IPAddress,
                    It.IsAny<CancellationToken>()))
                .ReturnsAsync(existingPC);

            _mockRepository
                .Setup(r => r.UpdateAsync(It.IsAny<FactoryMC>(), It.IsAny<CancellationToken>()))
                .Returns(Task.CompletedTask);

            
            var result = await _service.RegisterAgentAsync(request);

            
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
            
            var request = CreateValidRequest();
            request.LineNumber = 0; 

            
            var act = () => _service.RegisterAgentAsync(request);

            
            await act.Should().ThrowAsync<DomainValidationException>()
                .Where(ex => ex.ValidationErrors.ContainsKey("LineNumber"));
        }

        [Fact]
        public async Task RegisterAgentAsync_InvalidMCNumber_ThrowsValidationException()
        {
            
            var request = CreateValidRequest();
            request.MCNumber = 10001; 

            
            var act = () => _service.RegisterAgentAsync(request);

            
            await act.Should().ThrowAsync<DomainValidationException>()
                .Where(ex => ex.ValidationErrors.ContainsKey("MCNumber"));
        }

        [Fact]
        public async Task RegisterAgentAsync_MissingIPAddress_ThrowsValidationException()
        {
            
            var request = CreateValidRequest();
            request.IPAddress = ""; 

            
            var act = () => _service.RegisterAgentAsync(request);

            
            await act.Should().ThrowAsync<DomainValidationException>()
                .Where(ex => ex.ValidationErrors.ContainsKey("IPAddress"));
        }

        [Fact]
        public async Task RegisterAgentAsync_NullRequest_ThrowsArgumentNullException()
        {
            
            var act = () => _service.RegisterAgentAsync(null!);

            
            await act.Should().ThrowAsync<ArgumentNullException>();
        }

        #endregion

        #region Repository Error Tests

        [Fact]
        public async Task RegisterAgentAsync_RepositoryThrowsException_WrapsInRegistrationFailedException()
        {
            
            var request = CreateValidRequest();
            
            _mockRepository
                .Setup(r => r.FindByIpAsync(
                    It.IsAny<string>(),
                    It.IsAny<CancellationToken>()))
                .ThrowsAsync(new InvalidOperationException("Database connection failed"));

            
            var act = () => _service.RegisterAgentAsync(request);

            
            await act.Should().ThrowAsync<RegistrationFailedException>()
                .Where(ex =>
                    ex.LineNumber == request.LineNumber &&
                    ex.MCNumber == request.MCNumber);
        }

        [Fact]
        public async Task RegisterAgentAsync_RepositoryExceptionPreserved_WhenRepositoryExceptionThrown()
        {
            
            var request = CreateValidRequest();
            var repoException = new RepositoryException(
                entityType: "FactoryMC",
                operation: "Find",
                reason: "Database timeout");

            _mockRepository
                .Setup(r => r.FindByIpAsync(
                    It.IsAny<string>(),
                    It.IsAny<CancellationToken>()))
                .ThrowsAsync(repoException);

            
            var act = () => _service.RegisterAgentAsync(request);

            
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
                MCNumber = 1,
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
