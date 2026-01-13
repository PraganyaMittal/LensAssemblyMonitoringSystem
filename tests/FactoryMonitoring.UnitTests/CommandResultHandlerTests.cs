using FactoryMonitoringWeb.Commands.Agent;
using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Models;
using FactoryMonitoringWeb.Repositories;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Moq;

namespace FactoryMonitoring.UnitTests
{
    /// <summary>
    /// Unit tests for CommandResultHandler.
    /// </summary>
    public class CommandResultHandlerTests
    {
        private readonly Mock<IAgentCommandRepository> _mockCommandRepo;
        private readonly Mock<IFactoryPCRepository> _mockPcRepo;
        private readonly Mock<ILogger<CommandResultHandler>> _mockLogger;

        public CommandResultHandlerTests()
        {
            _mockCommandRepo = new Mock<IAgentCommandRepository>();
            _mockPcRepo = new Mock<IFactoryPCRepository>();
            _mockLogger = new Mock<ILogger<CommandResultHandler>>();
        }

        private FactoryDbContext CreateInMemoryContext()
        {
            var options = new DbContextOptionsBuilder<FactoryDbContext>()
                .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
                .Options;
            return new FactoryDbContext(options);
        }

        [Fact]
        public async Task HandleAsync_CommandNotFound_ReturnsNotFound()
        {
            // Arrange
            using var context = CreateInMemoryContext();
            _mockCommandRepo.Setup(r => r.GetByIdAsync(It.IsAny<int>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync((AgentCommand?)null);

            var handler = new CommandResultHandler(
                _mockCommandRepo.Object,
                _mockPcRepo.Object,
                context,
                _mockLogger.Object);

            var command = new CommandResultCommand(999, "Completed", null, null);

            // Act
            var result = await handler.HandleAsync(command);

            // Assert
            result.Success.Should().BeFalse();
            result.Message.Should().Be("Command not found");
        }

        [Fact]
        public async Task HandleAsync_ValidCommand_UpdatesStatus()
        {
            // Arrange
            using var context = CreateInMemoryContext();
            var agentCommand = new AgentCommand
            {
                CommandId = 1,
                PCId = 1,
                CommandType = "GetLogs",
                Status = "Pending"
            };

            _mockCommandRepo.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
                .ReturnsAsync(agentCommand);

            var handler = new CommandResultHandler(
                _mockCommandRepo.Object,
                _mockPcRepo.Object,
                context,
                _mockLogger.Object);

            var command = new CommandResultCommand(1, "Completed", "Success data", null);

            // Act
            var result = await handler.HandleAsync(command);

            // Assert
            result.Success.Should().BeTrue();
            result.AgentDeleted.Should().BeFalse();
            agentCommand.Status.Should().Be("Completed");
            agentCommand.ResultData.Should().Be("Success data");
        }

        [Fact]
        public async Task HandleAsync_ResetAgentCompleted_DeletesPC()
        {
            // Arrange
            using var context = CreateInMemoryContext();
            
            // Add PC to context
            var pc = new FactoryPC { PCId = 1, LineNumber = 1, PCNumber = 1, IPAddress = "127.0.0.1" };
            context.FactoryPCs.Add(pc);
            await context.SaveChangesAsync();

            var agentCommand = new AgentCommand
            {
                CommandId = 1,
                PCId = 1,
                CommandType = "ResetAgent",
                Status = "Pending"
            };

            _mockCommandRepo.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
                .ReturnsAsync(agentCommand);

            var handler = new CommandResultHandler(
                _mockCommandRepo.Object,
                _mockPcRepo.Object,
                context,
                _mockLogger.Object);

            var command = new CommandResultCommand(1, "Completed", null, null);

            // Act
            var result = await handler.HandleAsync(command);

            // Assert
            result.Success.Should().BeTrue();
            result.AgentDeleted.Should().BeTrue();

            var remainingPcs = await context.FactoryPCs.CountAsync();
            remainingPcs.Should().Be(0);
        }

        [Fact]
        public async Task HandleAsync_WithError_RecordsErrorMessage()
        {
            // Arrange
            using var context = CreateInMemoryContext();
            var agentCommand = new AgentCommand
            {
                CommandId = 1,
                PCId = 1,
                CommandType = "GetLogs",
                Status = "Pending"
            };

            _mockCommandRepo.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
                .ReturnsAsync(agentCommand);

            var handler = new CommandResultHandler(
                _mockCommandRepo.Object,
                _mockPcRepo.Object,
                context,
                _mockLogger.Object);

            var command = new CommandResultCommand(1, "Failed", null, "Disk full");

            // Act
            var result = await handler.HandleAsync(command);

            // Assert
            result.Success.Should().BeTrue();
            agentCommand.Status.Should().Be("Failed");
            agentCommand.ErrorMessage.Should().Be("Disk full");
        }
    }
}
