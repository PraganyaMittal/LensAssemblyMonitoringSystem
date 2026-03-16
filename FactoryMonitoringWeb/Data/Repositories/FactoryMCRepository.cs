using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Models.Exceptions;
using FactoryMonitoringWeb.Services.Batching;
using FactoryMonitoringWeb.Models;
using Microsoft.EntityFrameworkCore;

namespace FactoryMonitoringWeb.Data.Repositories
{

    public class FactoryMCRepository : IFactoryMCRepository
    {
        private readonly FactoryDbContext _context;
        private readonly ILogger<FactoryMCRepository> _logger;

        public FactoryMCRepository(
            FactoryDbContext context,
            ILogger<FactoryMCRepository> logger)
        {
            _context = context ?? throw new ArgumentNullException(nameof(context));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public async Task<FactoryMC?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
        {
            _logger.LogDebug("Getting FactoryMC by ID {MCId}", id);
            return await _context.FactoryMCs.FindAsync(new object[] { id }, cancellationToken);
        }

        public async Task<IEnumerable<FactoryMC>> GetAllAsync(CancellationToken cancellationToken = default)
        {
            _logger.LogDebug("Getting all FactoryMCs");
            return await _context.FactoryMCs.ToListAsync(cancellationToken);
        }

        public async Task<FactoryMC> AddAsync(FactoryMC entity, CancellationToken cancellationToken = default)
        {
            if (entity == null)
            {
                throw new ArgumentNullException(nameof(entity));
            }

            _logger.LogDebug(
                "Adding new FactoryMC - Line {LineNumber}, MC {MCNumber}",
                entity.LineNumber,
                entity.MCNumber);

            try
            {
                var entry = await _context.FactoryMCs.AddAsync(entity, cancellationToken);
                await _context.SaveChangesAsync(cancellationToken);

                _logger.LogInformation(
                    "Created FactoryMC with ID {MCId} - Line {LineNumber}, MC {MCNumber}",
                    entry.Entity.MCId,
                    entity.LineNumber,
                    entity.MCNumber);

                return entry.Entity;
            }
            catch (DbUpdateException ex)
            {
                _logger.LogError(ex, "Failed to add FactoryMC - Line {LineNumber}, MC {MCNumber}",
                    entity.LineNumber, entity.MCNumber);

                throw new RepositoryException(
                    entityType: nameof(FactoryMC),
                    operation: "Add",
                    reason: ex.InnerException?.Message ?? ex.Message,
                    correlationId: CorrelationContext.CorrelationId,
                    innerException: ex);
            }
        }

        public async Task UpdateAsync(FactoryMC entity, CancellationToken cancellationToken = default)
        {
            if (entity == null)
            {
                throw new ArgumentNullException(nameof(entity));
            }

            _logger.LogDebug("Updating FactoryMC {MCId}", entity.MCId);

            try
            {
                _context.FactoryMCs.Update(entity);
                await _context.SaveChangesAsync(cancellationToken);

                _logger.LogDebug("Updated FactoryMC {MCId}", entity.MCId);
            }
            catch (DbUpdateException ex)
            {
                _logger.LogError(ex, "Failed to update FactoryMC {MCId}", entity.MCId);

                throw new RepositoryException(
                    entityType: nameof(FactoryMC),
                    operation: "Update",
                    reason: ex.InnerException?.Message ?? ex.Message,
                    correlationId: CorrelationContext.CorrelationId,
                    innerException: ex);
            }
        }

        public async Task DeleteAsync(FactoryMC entity, CancellationToken cancellationToken = default)
        {
            if (entity == null)
            {
                throw new ArgumentNullException(nameof(entity));
            }

            _logger.LogDebug("Deleting FactoryMC {MCId}", entity.MCId);

            try
            {
                _context.FactoryMCs.Remove(entity);
                await _context.SaveChangesAsync(cancellationToken);

                _logger.LogInformation("Deleted FactoryMC {MCId}", entity.MCId);
            }
            catch (DbUpdateException ex)
            {
                _logger.LogError(ex, "Failed to delete FactoryMC {MCId}", entity.MCId);

                throw new RepositoryException(
                    entityType: nameof(FactoryMC),
                    operation: "Delete",
                    reason: ex.InnerException?.Message ?? ex.Message,
                    correlationId: CorrelationContext.CorrelationId,
                    innerException: ex);
            }
        }

        public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            return _context.SaveChangesAsync(cancellationToken);
        }

        public async Task<FactoryMC?> FindByIpAsync(
            string ipAddress,
            CancellationToken cancellationToken = default)
        {
            _logger.LogDebug(
                "Finding FactoryMC by IP Address {IpAddress}",
                ipAddress);

            return await _context.FactoryMCs
                .FirstOrDefaultAsync(p => p.IPAddress == ipAddress, cancellationToken);
        }

        public async Task<FactoryMC?> FindByLineAndMCAsync(
            int lineNumber,
            int mcNumber,
            string? modelVersion,
            CancellationToken cancellationToken = default)
        {
            _logger.LogDebug(
                "Finding FactoryMC by Line {LineNumber}, MC {MCNumber}, Version {ModelVersion}",
                lineNumber,
                mcNumber,
                modelVersion ?? "(any)");

            return await _context.FactoryMCs
                .FirstOrDefaultAsync(p =>
                    p.LineNumber == lineNumber &&
                    p.MCNumber == mcNumber &&
                    p.ModelVersion == modelVersion,
                    cancellationToken);
        }

        public async Task<IEnumerable<FactoryMC>> GetOnlineMCsAsync(CancellationToken cancellationToken = default)
        {
            _logger.LogDebug("Getting all online FactoryMCs");

            return await _context.FactoryMCs
                .Where(p => p.IsOnline)
                .ToListAsync(cancellationToken);
        }

        public async Task<IEnumerable<FactoryMC>> GetMCsWithStaleHeartbeatsAsync(
            DateTime cutoffTime,
            CancellationToken cancellationToken = default)
        {
            _logger.LogDebug("Getting MCs with stale heartbeats (cutoff: {CutoffTime})", cutoffTime);

            return await _context.FactoryMCs
                .Where(mc => mc.IsOnline &&
                            (mc.LastHeartbeat == null || mc.LastHeartbeat < cutoffTime))
                .ToListAsync(cancellationToken);
        }

        public async Task<int> MarkMCsOfflineAsync(
            IEnumerable<int> mcIds,
            CancellationToken cancellationToken = default)
        {
            var mcIdList = mcIds.ToList();
            if (!mcIdList.Any())
            {
                return 0;
            }

            _logger.LogDebug("Marking {Count} MCs as offline", mcIdList.Count);

            var updated = await _context.FactoryMCs
                .Where(mc => mcIdList.Contains(mc.MCId))
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(mc => mc.IsOnline, false)
                    .SetProperty(mc => mc.IsApplicationRunning, false)
                    .SetProperty(mc => mc.LastUpdated, DateTime.UtcNow),
                    cancellationToken);

            _logger.LogInformation("Marked {Count} MCs as offline", updated);
            return updated;
        }

        public async Task<FactoryMC?> GetByIdWithRelatedAsync(
            int mcId,
            bool includeConfig = false,
            bool includeModels = false,
            CancellationToken cancellationToken = default)
        {
            _logger.LogDebug(
                "Getting FactoryMC {MCId} with Config={IncludeConfig}, Models={IncludeModels}",
                mcId,
                includeConfig,
                includeModels);

            IQueryable<FactoryMC> query = _context.FactoryMCs;

            if (includeModels)
            {
                query = query.Include(p => p.Models);
            }

            return await query.FirstOrDefaultAsync(p => p.MCId == mcId, cancellationToken);
        }
    }
}

