using LensAssemblyMonitoringWeb.Data;
using LensAssemblyMonitoringWeb.Models;
using LensAssemblyMonitoringWeb.Data.Repositories;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Moq;

namespace LensAssemblyMonitoring.UnitTests
{
    
    
    
    public class ModelRepositoryTests
    {
        private readonly Mock<ILogger<ModelRepository>> _mockLogger;

        public ModelRepositoryTests()
        {
            _mockLogger = new Mock<ILogger<ModelRepository>>();
        }

        private LensAssemblyDbContext CreateInMemoryContext()
        {
            var options = new DbContextOptionsBuilder<LensAssemblyDbContext>()
                .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
                .ConfigureWarnings(x => x.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
                .Options;
            return new LensAssemblyDbContext(options);
        }

        [Fact]
        public async Task SyncModelsAsync_NewModels_InsertsAll()
        {
            
            using var context = CreateInMemoryContext();
            var repository = new ModelRepository(context, _mockLogger.Object);

            var models = new[]
            {
                new ModelSyncInfo { ModelName = "Model1", ModelPath = "/path/1", IsCurrent = true },
                new ModelSyncInfo { ModelName = "Model2", ModelPath = "/path/2", IsCurrent = false }
            };

            
            var result = await repository.SyncModelsAsync(1, models);

            
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
            
            using var context = CreateInMemoryContext();
            context.Models.Add(new Model { MCId = 1, ModelName = "Model1", ModelPath = "/old/path" });
            await context.SaveChangesAsync();

            var repository = new ModelRepository(context, _mockLogger.Object);

            var models = new[]
            {
                new ModelSyncInfo { ModelName = "Model1", ModelPath = "/new/path", IsCurrent = true }
            };

            
            var result = await repository.SyncModelsAsync(1, models);

            
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
            
            using var context = CreateInMemoryContext();
            context.Models.Add(new Model { MCId = 1, ModelName = "OldModel", ModelPath = "/old" });
            context.Models.Add(new Model { MCId = 1, ModelName = "KeptModel", ModelPath = "/kept" });
            await context.SaveChangesAsync();

            var repository = new ModelRepository(context, _mockLogger.Object);

            var models = new[]
            {
                new ModelSyncInfo { ModelName = "KeptModel", ModelPath = "/kept", IsCurrent = true }
            };

            
            var result = await repository.SyncModelsAsync(1, models);

            
            result.RemovedCount.Should().Be(1);

            var dbModels = await context.Models.ToListAsync();
            dbModels.Should().HaveCount(1);
            dbModels[0].ModelName.Should().Be("KeptModel");
        }

        [Fact]
        public async Task SyncModelsAsync_CurrentModelChange_UpdatesLastUsed()
        {
            
            using var context = CreateInMemoryContext();
            var existingModel = new Model 
            { 
                MCId = 1, 
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

            
            await repository.SyncModelsAsync(1, models);

            
            var dbModel = await context.Models.FirstAsync();
            dbModel.IsCurrentModel.Should().BeTrue();
            dbModel.LastUsed.Should().NotBeNull();
        }
    }
}
