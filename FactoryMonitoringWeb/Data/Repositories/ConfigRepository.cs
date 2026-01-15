using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Models.Exceptions;
using FactoryMonitoringWeb.Services.Batching;
using FactoryMonitoringWeb.Models;
using Microsoft.EntityFrameworkCore;

namespace FactoryMonitoringWeb.Data.Repositories
{
    /// <summary>
    /// EF Core implementation of IConfigRepository.
    /// 
    /// Design Decision: Optimized for CQRS pattern:
    /// - Commands use tracked entities for transactional integrity
    /// - Queries use projections to avoid loading large content strings
    /// 
    /// Transactional Integrity: Critical state transitions (clearing PendingUpdate 
    /// and setting UpdateApplied) happen in atomic SaveChanges calls.
    /// </summary>
    public class ConfigRepository : IConfigRepository
    {
        private readonly FactoryDbContext _context;
        private readonly ILogger<ConfigRepository> _logger;

        public ConfigRepository(
            FactoryDbContext context,
            ILogger<ConfigRepository> logger)
        {
            _context = context ?? throw new ArgumentNullException(nameof(context));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        #region IRepository<ConfigFile> Implementation

        public async Task<ConfigFile?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
        {
            return await _context.ConfigFiles.FindAsync(new object[] { id }, cancellationToken);
        }

        public async Task<IEnumerable<ConfigFile>> GetAllAsync(CancellationToken cancellationToken = default)
        {
            return await _context.ConfigFiles.ToListAsync(cancellationToken);
        }

        public async Task<ConfigFile> AddAsync(ConfigFile entity, CancellationToken cancellationToken = default)
        {
            if (entity == null) throw new ArgumentNullException(nameof(entity));

            var entry = await _context.ConfigFiles.AddAsync(entity, cancellationToken);
            await _context.SaveChangesAsync(cancellationToken);
            return entry.Entity;
        }

        public async Task UpdateAsync(ConfigFile entity, CancellationToken cancellationToken = default)
        {
            if (entity == null) throw new ArgumentNullException(nameof(entity));

            _context.ConfigFiles.Update(entity);
            await _context.SaveChangesAsync(cancellationToken);
        }

        public async Task DeleteAsync(ConfigFile entity, CancellationToken cancellationToken = default)
        {
            if (entity == null) throw new ArgumentNullException(nameof(entity));

            _context.ConfigFiles.Remove(entity);
            await _context.SaveChangesAsync(cancellationToken);
        }

        public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            return _context.SaveChangesAsync(cancellationToken);
        }

        #endregion

        #region Domain-Specific Methods

        /// <inheritdoc/>
        public async Task<ConfigFile?> GetByPCIdAsync(int pcId, CancellationToken cancellationToken = default)
        {
            return await _context.ConfigFiles
                .FirstOrDefaultAsync(c => c.PCId == pcId, cancellationToken);
        }

        /// <inheritdoc/>
        public async Task<ConfigUpsertResult> UpsertConfigAsync(
            int pcId,
            string configContent,
            CancellationToken cancellationToken = default)
        {
            _logger.LogDebug("Upserting config for PC {PCId}", pcId);

            // Step 1: Check existence with minimal data load
            // Only load ID and status flags, not the large content strings
            var existingInfo = await _context.ConfigFiles
                .Where(c => c.PCId == pcId)
                .Select(c => new { c.ConfigId, c.PendingUpdate })
                .FirstOrDefaultAsync(cancellationToken);

            if (existingInfo == null)
            {
                // New config - insert
                var newConfig = new ConfigFile
                {
                    PCId = pcId,
                    ConfigContent = configContent,
                    LastModified = DateTime.Now,
                    PendingUpdate = false,
                    UpdateApplied = false
                };

                await _context.ConfigFiles.AddAsync(newConfig, cancellationToken);
                await _context.SaveChangesAsync(cancellationToken);

                _logger.LogInformation("Created new config for PC {PCId}, ConfigId {ConfigId}", pcId, newConfig.ConfigId);
                return ConfigUpsertResult.Created(newConfig.ConfigId);
            }
            else
            {
                // Existing config - update
                // Use ExecuteUpdateAsync for efficiency when PendingUpdate needs to be cleared
                bool hadPendingUpdate = existingInfo.PendingUpdate;

                if (hadPendingUpdate)
                {
                    // Atomic update: set content, clear pending flag, set applied flag
                    await _context.ConfigFiles
                        .Where(c => c.ConfigId == existingInfo.ConfigId)
                        .ExecuteUpdateAsync(setters => setters
                            .SetProperty(c => c.ConfigContent, configContent)
                            .SetProperty(c => c.LastModified, DateTime.Now)
                            .SetProperty(c => c.PendingUpdate, false)
                            .SetProperty(c => c.UpdateApplied, true),
                            cancellationToken);

                    _logger.LogInformation(
                        "Updated config for PC {PCId}, cleared pending update",
                        pcId);
                }
                else
                {
                    // Simple update - just update content
                    await _context.ConfigFiles
                        .Where(c => c.ConfigId == existingInfo.ConfigId)
                        .ExecuteUpdateAsync(setters => setters
                            .SetProperty(c => c.ConfigContent, configContent)
                            .SetProperty(c => c.LastModified, DateTime.Now),
                            cancellationToken);

                    _logger.LogDebug("Updated config for PC {PCId}", pcId);
                }

                return ConfigUpsertResult.Updated(existingInfo.ConfigId, hadPendingUpdate);
            }
        }

        /// <inheritdoc/>
        public async Task<PendingConfigUpdate?> GetPendingUpdateAsync(
            int pcId,
            CancellationToken cancellationToken = default)
        {
            _logger.LogDebug("Checking pending config update for PC {PCId}", pcId);

            // Projection: only load what we need, not the full ConfigContent
            var pending = await _context.ConfigFiles
                .Where(c => c.PCId == pcId && c.PendingUpdate)
                .Select(c => new PendingConfigUpdate
                {
                    UpdatedContent = c.UpdatedContent ?? string.Empty,
                    RequestTime = c.UpdateRequestTime
                })
                .FirstOrDefaultAsync(cancellationToken);

            if (pending != null)
            {
                _logger.LogDebug("Found pending config update for PC {PCId}", pcId);
            }

            return pending;
        }

        /// <inheritdoc/>
        public async Task<bool> SetPendingUpdateAsync(
            int pcId,
            string newContent,
            CancellationToken cancellationToken = default)
        {
            _logger.LogDebug("Setting pending config update for PC {PCId}", pcId);

            var updated = await _context.ConfigFiles
                .Where(c => c.PCId == pcId)
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(c => c.PendingUpdate, true)
                    .SetProperty(c => c.UpdatedContent, newContent)
                    .SetProperty(c => c.UpdateRequestTime, DateTime.Now)
                    .SetProperty(c => c.UpdateApplied, false),
                    cancellationToken);

            if (updated > 0)
            {
                _logger.LogInformation("Set pending config update for PC {PCId}", pcId);
                return true;
            }

            _logger.LogWarning("No config found for PC {PCId} to set pending update", pcId);
            return false;
        }

        #endregion
    }
}
