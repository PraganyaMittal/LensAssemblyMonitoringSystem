using LensAssemblyMonitoringWeb.Infrastructure.Persistence.Repositories;
using LensAssemblyMonitoringWeb.Infrastructure.Persistence;
using LensAssemblyMonitoringWeb.Shared.Exceptions;
using LensAssemblyMonitoringWeb.Features.Logs.Batching;
using LensAssemblyMonitoringWeb.Shared.Correlation;
using LensAssemblyMonitoringWeb.Features.Agents.Domain;
using LensAssemblyMonitoringWeb.Features.Machines.Domain;
using LensAssemblyMonitoringWeb.Features.Models.Domain;
using LensAssemblyMonitoringWeb.Features.Updates.Domain;
using LensAssemblyMonitoringWeb.Features.Logs.Domain;
using LensAssemblyMonitoringWeb.Features.Yield.Domain;
using Microsoft.EntityFrameworkCore;

namespace LensAssemblyMonitoringWeb.Features.Machines.Data
{

    public class LensAssemblyMCRepository : ILensAssemblyMCRepository
    {
        private readonly LensAssemblyDbContext _context;
        private readonly ILogger<LensAssemblyMCRepository> _logger;

        public LensAssemblyMCRepository(
            LensAssemblyDbContext context,
            ILogger<LensAssemblyMCRepository> logger)
        {
            _context = context ?? throw new ArgumentNullException(nameof(context));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public async Task<LensAssemblyMC?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
        {
            _logger.LogDebug("Getting LensAssemblyMC by ID {MCId}", id);
            return await _context.LensAssemblyMCs.FindAsync(new object[] { id }, cancellationToken);
        }

        public async Task<IEnumerable<LensAssemblyMC>> GetAllAsync(CancellationToken cancellationToken = default)
        {
            _logger.LogDebug("Getting all LensAssemblyMCs");
            return await _context.LensAssemblyMCs.ToListAsync(cancellationToken);
        }

        public async Task<LensAssemblyMC> AddAsync(LensAssemblyMC entity, CancellationToken cancellationToken = default)
        {
            if (entity == null)
            {
                throw new ArgumentNullException(nameof(entity));
            }

            _logger.LogDebug(
                "Adding new LensAssemblyMC - Line {LineNumber}, MC {MCNumber}",
                entity.LineNumber,
                entity.MCNumber);

            try
            {
                var entry = await _context.LensAssemblyMCs.AddAsync(entity, cancellationToken);
                await _context.SaveChangesAsync(cancellationToken);

                _logger.LogInformation(
                    "Created LensAssemblyMC with ID {MCId} - Line {LineNumber}, MC {MCNumber}",
                    entry.Entity.MCId,
                    entity.LineNumber,
                    entity.MCNumber);

                return entry.Entity;
            }
            catch (DbUpdateException ex)
            {
                _logger.LogError(ex, "Failed to add LensAssemblyMC - Line {LineNumber}, MC {MCNumber}",
                    entity.LineNumber, entity.MCNumber);

                throw new RepositoryException(
                    entityType: nameof(LensAssemblyMC),
                    operation: "Add",
                    reason: ex.InnerException?.Message ?? ex.Message,
                    correlationId: CorrelationContext.CorrelationId,
                    innerException: ex);
            }
        }

        public async Task UpdateAsync(LensAssemblyMC entity, CancellationToken cancellationToken = default)
        {
            if (entity == null)
            {
                throw new ArgumentNullException(nameof(entity));
            }

            _logger.LogDebug("Updating LensAssemblyMC {MCId}", entity.MCId);

            try
            {
                _context.LensAssemblyMCs.Update(entity);
                await _context.SaveChangesAsync(cancellationToken);

                _logger.LogDebug("Updated LensAssemblyMC {MCId}", entity.MCId);
            }
            catch (DbUpdateException ex)
            {
                _logger.LogError(ex, "Failed to update LensAssemblyMC {MCId}", entity.MCId);

                throw new RepositoryException(
                    entityType: nameof(LensAssemblyMC),
                    operation: "Update",
                    reason: ex.InnerException?.Message ?? ex.Message,
                    correlationId: CorrelationContext.CorrelationId,
                    innerException: ex);
            }
        }

        public async Task DeleteAsync(LensAssemblyMC entity, CancellationToken cancellationToken = default)
        {
            if (entity == null)
            {
                throw new ArgumentNullException(nameof(entity));
            }

            _logger.LogDebug("Deleting LensAssemblyMC {MCId}", entity.MCId);

            try
            {
                _context.LensAssemblyMCs.Remove(entity);
                await _context.SaveChangesAsync(cancellationToken);

                _logger.LogInformation("Deleted LensAssemblyMC {MCId}", entity.MCId);
            }
            catch (DbUpdateException ex)
            {
                _logger.LogError(ex, "Failed to delete LensAssemblyMC {MCId}", entity.MCId);

                throw new RepositoryException(
                    entityType: nameof(LensAssemblyMC),
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

        public async Task<LensAssemblyMC?> FindByIpAsync(
            string ipAddress,
            CancellationToken cancellationToken = default)
        {
            _logger.LogDebug(
                "Finding LensAssemblyMC by IP Address {IpAddress}",
                ipAddress);

            return await _context.LensAssemblyMCs
                .FirstOrDefaultAsync(p =>
                    p.IPAddress == ipAddress &&
                    p.LifecycleState != "Decommissioned",
                    cancellationToken);
        }

        public async Task<LensAssemblyMC?> FindByLineAndMCAsync(
            int lineNumber,
            int mcNumber,
            string? generationNo,
            CancellationToken cancellationToken = default)
        {
            _logger.LogDebug(
                "Finding LensAssemblyMC by Line {LineNumber}, MC {MCNumber}, Version {GenerationNo}",
                lineNumber,
                mcNumber,
                generationNo ?? "(any)");

            return await _context.LensAssemblyMCs
                .FirstOrDefaultAsync(p =>
                    p.LineNumber == lineNumber &&
                    p.MCNumber == mcNumber &&
                    p.GenerationNo == generationNo &&
                    p.LifecycleState != "Decommissioned",
                    cancellationToken);
        }

        public async Task<IEnumerable<LensAssemblyMC>> GetOnlineMCsAsync(CancellationToken cancellationToken = default)
        {
            _logger.LogDebug("Getting all online LensAssemblyMCs");

            return await _context.LensAssemblyMCs
                .Where(p => p.IsOnline && p.LifecycleState != "Decommissioned")
                .ToListAsync(cancellationToken);
        }

        public async Task<IEnumerable<LensAssemblyMC>> GetMCsWithStaleHeartbeatsAsync(
            DateTime cutoffTime,
            CancellationToken cancellationToken = default)
        {
            _logger.LogDebug("Getting MCs with stale heartbeats (cutoff: {CutoffTime})", cutoffTime);

            return await _context.LensAssemblyMCs
                .Where(mc => mc.IsOnline &&
                            mc.LifecycleState != "Decommissioned" &&
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

            var updated = await _context.LensAssemblyMCs
                .Where(mc => mcIdList.Contains(mc.MCId))
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(mc => mc.IsOnline, false)
                    .SetProperty(mc => mc.IsApplicationRunning, false)
                    .SetProperty(mc => mc.LastUpdated, DateTime.UtcNow),
                    cancellationToken);

            _logger.LogInformation("Marked {Count} MCs as offline", updated);
            return updated;
        }

        public async Task<LensAssemblyMC?> GetByIdWithRelatedAsync(
            int mcId,
            bool includeConfig = false,
            bool includeModels = false,
            CancellationToken cancellationToken = default)
        {
            _logger.LogDebug(
                "Getting LensAssemblyMC {MCId} with Config={IncludeConfig}, Models={IncludeModels}",
                mcId,
                includeConfig,
                includeModels);

            IQueryable<LensAssemblyMC> query = _context.LensAssemblyMCs;

            if (includeModels)
            {
                query = query.Include(p => p.Models);
            }

            return await query.FirstOrDefaultAsync(p =>
                p.MCId == mcId &&
                p.LifecycleState != "Decommissioned",
                cancellationToken);
        }
    }
}




