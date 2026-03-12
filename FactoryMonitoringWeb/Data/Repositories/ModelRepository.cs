using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Models;
using Microsoft.EntityFrameworkCore;

namespace FactoryMonitoringWeb.Data.Repositories
{
    /// <summary>
    /// EF Core implementation of IModelRepository.
    /// 
    /// Design Decision: All sync operations in single SaveChangesAsync call
    /// for transactional integrity.
    /// </summary>
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

        /// <inheritdoc/>
        public async Task<IList<Model>> GetByPCIdAsync(int MCId, CancellationToken cancellationToken = default)
        {
            return await _context.Models
                .Where(m => m.MCId == MCId)
                .ToListAsync(cancellationToken);
        }

        /// <inheritdoc/>
        public async Task<ModelSyncResult> SyncModelsAsync(
            int MCId,
            IEnumerable<ModelSyncInfo> models,
            CancellationToken cancellationToken = default)
        {
            _logger.LogDebug("Syncing models for PC {MCId}", MCId);

            using var transaction = await _context.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken);
            try
            {
                // Step 1: Get existing models for this PC
                var existingModels = await _context.Models
                    .Where(m => m.MCId == MCId)
                    .ToListAsync(cancellationToken);

                var modelList = models.ToList();
                int insertedCount = 0;
                int updatedCount = 0;
                string? currentModelName = null;

                // Step 2: Process each model from request
                foreach (var modelInfo in modelList)
                {
                    var existing = existingModels.FirstOrDefault(m => m.ModelName == modelInfo.ModelName);

                    if (existing == null)
                    {
                        // New model - insert
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
                        // Existing model - update
                        bool wasCurrent = existing.IsCurrentModel;
                        
                        existing.ModelPath = modelInfo.ModelPath;
                        existing.IsCurrentModel = modelInfo.IsCurrent;

                        // Track when model becomes current
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

                // Step 3: Remove models not in request
                var modelNamesFromRequest = modelList.Select(m => m.ModelName).ToHashSet();
                var modelsToRemove = existingModels
                    .Where(m => !modelNamesFromRequest.Contains(m.ModelName))
                    .ToList();

                _context.Models.RemoveRange(modelsToRemove);
                int removedCount = modelsToRemove.Count;

                // Step 4: Save all changes in single transaction
                await _context.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);

                _logger.LogInformation(
                    "Model sync for PC {MCId}: {Inserted} inserted, {Updated} updated, {Removed} removed, current: {Current}",
                    MCId,
                    insertedCount,
                    updatedCount,
                    removedCount,
                    currentModelName ?? "none");

                return ModelSyncResult.Create(insertedCount, updatedCount, removedCount, currentModelName);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Transaction failed during model sync for PC {MCId}", MCId);
                await transaction.RollbackAsync(cancellationToken);
                throw;
            }
        }

        /// <inheritdoc/>
        public async Task<Model?> GetCurrentModelAsync(int MCId, CancellationToken cancellationToken = default)
        {
            return await _context.Models
                .FirstOrDefaultAsync(m => m.MCId == MCId && m.IsCurrentModel, cancellationToken);
        }

        #endregion
    }
}
