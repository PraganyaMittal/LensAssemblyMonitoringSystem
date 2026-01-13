using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Exceptions;
using FactoryMonitoringWeb.Infrastructure;
using FactoryMonitoringWeb.Models;
using Microsoft.EntityFrameworkCore;

namespace FactoryMonitoringWeb.Repositories
{
    /// <summary>
    /// EF Core implementation of IFactoryPCRepository.
    /// 
    /// Design Decision: Scoped lifetime in DI because:
    /// 1. DbContext is scoped per request
    /// 2. Repositories should share the same context for unit of work
    /// 3. Avoids connection pool exhaustion
    /// 
    /// Defensive programming: All public methods validate inputs and log operations.
    /// </summary>
    public class FactoryPCRepository : IFactoryPCRepository
    {
        private readonly FactoryDbContext _context;
        private readonly ILogger<FactoryPCRepository> _logger;

        public FactoryPCRepository(
            FactoryDbContext context,
            ILogger<FactoryPCRepository> logger)
        {
            _context = context ?? throw new ArgumentNullException(nameof(context));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        /// <inheritdoc/>
        public async Task<FactoryPC?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
        {
            _logger.LogDebug("Getting FactoryPC by ID {PCId}", id);
            return await _context.FactoryPCs.FindAsync(new object[] { id }, cancellationToken);
        }

        /// <inheritdoc/>
        public async Task<IEnumerable<FactoryPC>> GetAllAsync(CancellationToken cancellationToken = default)
        {
            _logger.LogDebug("Getting all FactoryPCs");
            return await _context.FactoryPCs.ToListAsync(cancellationToken);
        }

        /// <inheritdoc/>
        public async Task<FactoryPC> AddAsync(FactoryPC entity, CancellationToken cancellationToken = default)
        {
            if (entity == null)
            {
                throw new ArgumentNullException(nameof(entity));
            }

            _logger.LogDebug(
                "Adding new FactoryPC - Line {LineNumber}, PC {PCNumber}",
                entity.LineNumber,
                entity.PCNumber);

            try
            {
                var entry = await _context.FactoryPCs.AddAsync(entity, cancellationToken);
                await _context.SaveChangesAsync(cancellationToken);

                _logger.LogInformation(
                    "Created FactoryPC with ID {PCId} - Line {LineNumber}, PC {PCNumber}",
                    entry.Entity.PCId,
                    entity.LineNumber,
                    entity.PCNumber);

                return entry.Entity;
            }
            catch (DbUpdateException ex)
            {
                _logger.LogError(ex, "Failed to add FactoryPC - Line {LineNumber}, PC {PCNumber}",
                    entity.LineNumber, entity.PCNumber);

                throw new RepositoryException(
                    entityType: nameof(FactoryPC),
                    operation: "Add",
                    reason: ex.InnerException?.Message ?? ex.Message,
                    correlationId: CorrelationContext.CorrelationId,
                    innerException: ex);
            }
        }

        /// <inheritdoc/>
        public async Task UpdateAsync(FactoryPC entity, CancellationToken cancellationToken = default)
        {
            if (entity == null)
            {
                throw new ArgumentNullException(nameof(entity));
            }

            _logger.LogDebug("Updating FactoryPC {PCId}", entity.PCId);

            try
            {
                _context.FactoryPCs.Update(entity);
                await _context.SaveChangesAsync(cancellationToken);

                _logger.LogDebug("Updated FactoryPC {PCId}", entity.PCId);
            }
            catch (DbUpdateException ex)
            {
                _logger.LogError(ex, "Failed to update FactoryPC {PCId}", entity.PCId);

                throw new RepositoryException(
                    entityType: nameof(FactoryPC),
                    operation: "Update",
                    reason: ex.InnerException?.Message ?? ex.Message,
                    correlationId: CorrelationContext.CorrelationId,
                    innerException: ex);
            }
        }

        /// <inheritdoc/>
        public async Task DeleteAsync(FactoryPC entity, CancellationToken cancellationToken = default)
        {
            if (entity == null)
            {
                throw new ArgumentNullException(nameof(entity));
            }

            _logger.LogDebug("Deleting FactoryPC {PCId}", entity.PCId);

            try
            {
                _context.FactoryPCs.Remove(entity);
                await _context.SaveChangesAsync(cancellationToken);

                _logger.LogInformation("Deleted FactoryPC {PCId}", entity.PCId);
            }
            catch (DbUpdateException ex)
            {
                _logger.LogError(ex, "Failed to delete FactoryPC {PCId}", entity.PCId);

                throw new RepositoryException(
                    entityType: nameof(FactoryPC),
                    operation: "Delete",
                    reason: ex.InnerException?.Message ?? ex.Message,
                    correlationId: CorrelationContext.CorrelationId,
                    innerException: ex);
            }
        }

        /// <inheritdoc/>
        public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            return _context.SaveChangesAsync(cancellationToken);
        }

        /// <inheritdoc/>
        public async Task<FactoryPC?> FindByLineAndPCAsync(
            int lineNumber,
            int pcNumber,
            string? modelVersion,
            CancellationToken cancellationToken = default)
        {
            _logger.LogDebug(
                "Finding FactoryPC by Line {LineNumber}, PC {PCNumber}, Version {ModelVersion}",
                lineNumber,
                pcNumber,
                modelVersion ?? "(any)");

            return await _context.FactoryPCs
                .FirstOrDefaultAsync(p =>
                    p.LineNumber == lineNumber &&
                    p.PCNumber == pcNumber &&
                    p.ModelVersion == modelVersion,
                    cancellationToken);
        }

        /// <inheritdoc/>
        public async Task<IEnumerable<FactoryPC>> GetOnlinePCsAsync(CancellationToken cancellationToken = default)
        {
            _logger.LogDebug("Getting all online FactoryPCs");

            return await _context.FactoryPCs
                .Where(p => p.IsOnline)
                .ToListAsync(cancellationToken);
        }

        /// <inheritdoc/>
        public async Task<IEnumerable<FactoryPC>> GetPCsWithStaleHeartbeatsAsync(
            DateTime cutoffTime,
            CancellationToken cancellationToken = default)
        {
            _logger.LogDebug("Getting PCs with stale heartbeats (cutoff: {CutoffTime})", cutoffTime);

            return await _context.FactoryPCs
                .Where(pc => pc.IsOnline &&
                            (pc.LastHeartbeat == null || pc.LastHeartbeat < cutoffTime))
                .ToListAsync(cancellationToken);
        }

        /// <inheritdoc/>
        public async Task<int> MarkPCsOfflineAsync(
            IEnumerable<int> pcIds,
            CancellationToken cancellationToken = default)
        {
            var pcIdList = pcIds.ToList();
            if (!pcIdList.Any())
            {
                return 0;
            }

            _logger.LogDebug("Marking {Count} PCs as offline", pcIdList.Count);

            // Use ExecuteUpdateAsync for efficient batch update (EF Core 7+)
            var updated = await _context.FactoryPCs
                .Where(pc => pcIdList.Contains(pc.PCId))
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(pc => pc.IsOnline, false)
                    .SetProperty(pc => pc.IsApplicationRunning, false)
                    .SetProperty(pc => pc.LastUpdated, DateTime.Now),
                    cancellationToken);

            _logger.LogInformation("Marked {Count} PCs as offline", updated);
            return updated;
        }

        /// <inheritdoc/>
        public async Task<FactoryPC?> GetByIdWithRelatedAsync(
            int pcId,
            bool includeConfig = false,
            bool includeModels = false,
            CancellationToken cancellationToken = default)
        {
            _logger.LogDebug(
                "Getting FactoryPC {PCId} with Config={IncludeConfig}, Models={IncludeModels}",
                pcId,
                includeConfig,
                includeModels);

            IQueryable<FactoryPC> query = _context.FactoryPCs;

            if (includeConfig)
            {
                query = query.Include(p => p.ConfigFile);
            }

            if (includeModels)
            {
                query = query.Include(p => p.Models);
            }

            return await query.FirstOrDefaultAsync(p => p.PCId == pcId, cancellationToken);
        }
    }
}
