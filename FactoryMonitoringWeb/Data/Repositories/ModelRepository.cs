using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Models;
using Microsoft.EntityFrameworkCore;

namespace FactoryMonitoringWeb.Data.Repositories
{

    public class ModelRepository : IModelRepository
    {
        private readonly FactoryDbContext _context;
        private readonly ILogger<ModelRepository> _logger;

        public ModelRepository(
            FactoryDbContext context,
            ILogger<ModelRepository> logger)
        {
            _context = context ?? throw new ArgumentNullException(nameof(context));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        #region IRepository<Model> Implementation

        public async Task<Model?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
        {
            return await _context.Models.FindAsync(new object[] { id }, cancellationToken);
        }

        public async Task<IEnumerable<Model>> GetAllAsync(CancellationToken cancellationToken = default)
        {
            return await _context.Models.ToListAsync(cancellationToken);
        }

        public async Task<Model> AddAsync(Model entity, CancellationToken cancellationToken = default)
        {
            if (entity == null) throw new ArgumentNullException(nameof(entity));

            var entry = await _context.Models.AddAsync(entity, cancellationToken);
            await _context.SaveChangesAsync(cancellationToken);
            return entry.Entity;
        }

        public async Task UpdateAsync(Model entity, CancellationToken cancellationToken = default)
        {
            if (entity == null) throw new ArgumentNullException(nameof(entity));

            _context.Models.Update(entity);
            await _context.SaveChangesAsync(cancellationToken);
        }

        public async Task DeleteAsync(Model entity, CancellationToken cancellationToken = default)
        {
            if (entity == null) throw new ArgumentNullException(nameof(entity));

            _context.Models.Remove(entity);
            await _context.SaveChangesAsync(cancellationToken);
        }

        public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            return _context.SaveChangesAsync(cancellationToken);
        }

        #endregion

        #region Domain-Specific Methods

        public async Task<IList<Model>> GetByMCIdAsync(int MCId, CancellationToken cancellationToken = default)
        {
            return await _context.Models
                .Where(m => m.MCId == MCId)
                .ToListAsync(cancellationToken);
        }

        public async Task<ModelSyncResult> SyncModelsAsync(
            int MCId,
            IEnumerable<ModelSyncInfo> models,
            CancellationToken cancellationToken = default)
        {
            _logger.LogDebug("Syncing models for MC {MCId}", MCId);

            using var transaction = await _context.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken);
            try
            {
                
                var existingModels = await _context.Models
                    .Where(m => m.MCId == MCId)
                    .ToListAsync(cancellationToken);

                var modelList = models.ToList();
                int insertedCount = 0;
                int updatedCount = 0;
                string? currentModelName = null;

                foreach (var modelInfo in modelList)
                {
                    var existing = existingModels.FirstOrDefault(m => m.ModelName == modelInfo.ModelName);

                    if (existing == null)
                    {
                        
                        var newModel = new Model
                        {
                            MCId = MCId,
                            ModelName = modelInfo.ModelName,
                            ModelPath = modelInfo.ModelPath,
                            IsCurrentModel = modelInfo.IsCurrent,
                            DiscoveredDate = DateTime.Now,
                            LastUsed = modelInfo.IsCurrent ? DateTime.Now : null
                        };
                        _context.Models.Add(newModel);
                        insertedCount++;

                        if (modelInfo.IsCurrent)
                        {
                            currentModelName = modelInfo.ModelName;
                        }
                    }
                    else
                    {
                        
                        bool wasCurrent = existing.IsCurrentModel;
                        
                        existing.ModelPath = modelInfo.ModelPath;
                        existing.IsCurrentModel = modelInfo.IsCurrent;

                        if (modelInfo.IsCurrent && !wasCurrent)
                        {
                            existing.LastUsed = DateTime.Now;
                        }

                        updatedCount++;

                        if (modelInfo.IsCurrent)
                        {
                            currentModelName = modelInfo.ModelName;
                        }
                    }
                }

                var modelNamesFromRequest = modelList.Select(m => m.ModelName).ToHashSet();
                var modelsToRemove = existingModels
                    .Where(m => !modelNamesFromRequest.Contains(m.ModelName))
                    .ToList();

                _context.Models.RemoveRange(modelsToRemove);
                int removedCount = modelsToRemove.Count;

                await _context.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);

                _logger.LogInformation(
                    "Model sync for MC {MCId}: {Inserted} inserted, {Updated} updated, {Removed} removed, current: {Current}",
                    MCId,
                    insertedCount,
                    updatedCount,
                    removedCount,
                    currentModelName ?? "none");

                return ModelSyncResult.Create(insertedCount, updatedCount, removedCount, currentModelName);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Transaction failed during model sync for MC {MCId}", MCId);
                await transaction.RollbackAsync(cancellationToken);
                throw;
            }
        }

        public async Task<Model?> GetCurrentModelAsync(int MCId, CancellationToken cancellationToken = default)
        {
            return await _context.Models
                .FirstOrDefaultAsync(m => m.MCId == MCId && m.IsCurrentModel, cancellationToken);
        }

        public async Task UpdateCurrentModelAsync(int MCId, string? currentModelName, CancellationToken cancellationToken = default)
        {
            var models = await _context.Models
                .Where(m => m.MCId == MCId)
                .ToListAsync(cancellationToken);

            if (models.Count == 0) return;

            bool changed = false;

            foreach (var model in models)
            {
                bool shouldBeCurrent = !string.IsNullOrEmpty(currentModelName) 
                    && model.ModelName == currentModelName;

                if (model.IsCurrentModel != shouldBeCurrent)
                {
                    model.IsCurrentModel = shouldBeCurrent;
                    if (shouldBeCurrent) model.LastUsed = DateTime.Now;
                    changed = true;
                }
            }

            if (changed)
            {
                await _context.SaveChangesAsync(cancellationToken);
                _logger.LogInformation(
                    "Updated current model for MC {MCId}: {ModelName}",
                    MCId,
                    string.IsNullOrEmpty(currentModelName) ? "(cleared)" : currentModelName);
            }
        }

        #endregion
    }
}

