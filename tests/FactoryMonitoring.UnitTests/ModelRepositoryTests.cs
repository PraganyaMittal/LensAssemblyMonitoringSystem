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
    /// Unit tests for ModelRepository.SyncModelsAsync.
    /// </summary>
    public class ModelRepositoryTests
    {
        private readonly Mock<ILogger<ModelRepository>> _mockLogger;

        public ModelRepositoryTests()
        {
            _mockLogger = new Mock<ILogger<ModelRepository>>();
        }

        private FactoryDbContext CreateInMemoryContext()
        {
            var options = new DbContextOptionsBuilder<FactoryDbContext>()
                .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
                .Options;
            return new FactoryDbContext(options);
        }

        [Fact]
        public async Task SyncModelsAsync_NewModels_InsertsAll()
        {
            // Arrange
            using var context = CreateInMemoryContext();
            var repository = new ModelRepository(context, _mockLogger.Object);

            var models = new[]
            {
                new ModelSyncInfo { ModelName = "Model1", ModelPath = "/path/1", IsCurrent = true },
                new ModelSyncInfo { ModelName = "Model2", ModelPath = "/path/2", IsCurrent = false }
            };

            // Act
            var result = await repository.SyncModelsAsync(1, models);

            // Assert
            result.InsertedCount.Should().Be(2);
            result.UpdatedCount.Should().Be(0);
            result.RemovedCount.Should().Be(0);
            result.CurrentModelName.Should().Be("Model1");

            var dbModels = await context.Models.ToListAsync();
            dbModels.Should().HaveCount(2);
        }

        [Fact]
        public async Task SyncModelsAsync_ExistingModels_UpdatesAll()
        {
            // Arrange
            using var context = CreateInMemoryContext();
            context.Models.Add(new Model { PCId = 1, ModelName = "Model1", ModelPath = "/old/path" });
            await context.SaveChangesAsync();

            var repository = new ModelRepository(context, _mockLogger.Object);

            var models = new[]
            {
                new ModelSyncInfo { ModelName = "Model1", ModelPath = "/new/path", IsCurrent = true }
            };

            // Act
            var result = await repository.SyncModelsAsync(1, models);

            // Assert
            result.InsertedCount.Should().Be(0);
            result.UpdatedCount.Should().Be(1);
            result.CurrentModelName.Should().Be("Model1");

            var dbModel = await context.Models.FirstAsync();
            dbModel.ModelPath.Should().Be("/new/path");
            dbModel.IsCurrentModel.Should().BeTrue();
        }

        [Fact]
        public async Task SyncModelsAsync_RemovedModels_DeletesThem()
        {
            // Arrange
            using var context = CreateInMemoryContext();
            context.Models.Add(new Model { PCId = 1, ModelName = "OldModel", ModelPath = "/old" });
            context.Models.Add(new Model { PCId = 1, ModelName = "KeptModel", ModelPath = "/kept" });
            await context.SaveChangesAsync();

            var repository = new ModelRepository(context, _mockLogger.Object);

            var models = new[]
            {
                new ModelSyncInfo { ModelName = "KeptModel", ModelPath = "/kept", IsCurrent = true }
            };

            // Act
            var result = await repository.SyncModelsAsync(1, models);

            // Assert
            result.RemovedCount.Should().Be(1);

            var dbModels = await context.Models.ToListAsync();
            dbModels.Should().HaveCount(1);
            dbModels[0].ModelName.Should().Be("KeptModel");
        }

        [Fact]
        public async Task SyncModelsAsync_CurrentModelChange_UpdatesLastUsed()
        {
            // Arrange
            using var context = CreateInMemoryContext();
            var existingModel = new Model 
            { 
                PCId = 1, 
                ModelName = "Model1", 
                ModelPath = "/path",
                IsCurrentModel = false,
                LastUsed = null
            };
            context.Models.Add(existingModel);
            await context.SaveChangesAsync();

            var repository = new ModelRepository(context, _mockLogger.Object);

            var models = new[]
            {
                new ModelSyncInfo { ModelName = "Model1", ModelPath = "/path", IsCurrent = true }
            };

            // Act
            await repository.SyncModelsAsync(1, models);

            // Assert
            var dbModel = await context.Models.FirstAsync();
            dbModel.IsCurrentModel.Should().BeTrue();
            dbModel.LastUsed.Should().NotBeNull();
        }
    }
}
