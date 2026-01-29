using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Models.Exceptions;
using FactoryMonitoringWeb.Services.Batching;
using FactoryMonitoringWeb.Models;
using Microsoft.EntityFrameworkCore;

namespace FactoryMonitoringWeb.Data.Repositories
{
    /// <summary>
    /// EF Core implementation of IAgentCommandRepository.
    /// 
    /// Design Decision: Optimized for high-throughput heartbeat processing:
    /// 1. Uses ExecuteUpdateAsync for atomic batch updates (EF Core 7+)
    /// 2. Minimal round-trips: fetch + update in single transaction
    /// 3. No tracking for read-only queries (AsNoTracking)
    /// 
    /// Concurrency Strategy: Uses EF Core's ExecuteUpdateAsync which generates
    /// efficient SQL UPDATE statements with WHERE clauses that only match
    /// commands still in "Pending" status, preventing race conditions.
    /// </summary>
    public class AgentCommandRepository : IAgentCommandRepository
    {
        private readonly FactoryDbContext _context;
        private readonly ILogger<AgentCommandRepository> _logger;

        public AgentCommandRepository(
            FactoryDbContext context,
            ILogger<AgentCommandRepository> logger)
        {
            _context = context ?? throw new ArgumentNullException(nameof(context));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        #region IRepository<AgentCommand> Implementation

        public async Task<AgentCommand?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
        {
            return await _context.AgentCommands.FindAsync(new object[] { id }, cancellationToken);
        }

        public async Task<IEnumerable<AgentCommand>> GetAllAsync(CancellationToken cancellationToken = default)
        {
            return await _context.AgentCommands.ToListAsync(cancellationToken);
        }

        public async Task<AgentCommand> AddAsync(AgentCommand entity, CancellationToken cancellationToken = default)
        {
            if (entity == null) throw new ArgumentNullException(nameof(entity));

            var entry = await _context.AgentCommands.AddAsync(entity, cancellationToken);
            await _context.SaveChangesAsync(cancellationToken);
            return entry.Entity;
        }

        public async Task UpdateAsync(AgentCommand entity, CancellationToken cancellationToken = default)
        {
            if (entity == null) throw new ArgumentNullException(nameof(entity));

            _context.AgentCommands.Update(entity);
            await _context.SaveChangesAsync(cancellationToken);
        }

        public async Task DeleteAsync(AgentCommand entity, CancellationToken cancellationToken = default)
        {
            if (entity == null) throw new ArgumentNullException(nameof(entity));

            _context.AgentCommands.Remove(entity);
            await _context.SaveChangesAsync(cancellationToken);
        }

        public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            return _context.SaveChangesAsync(cancellationToken);
        }

        #endregion

        #region Domain-Specific Methods

        /// <inheritdoc/>
        public async Task<IList<AgentCommand>> GetPendingCommandsAsync(
            int MCId,
            IEnumerable<string>? excludedCommandTypes = null,
            CancellationToken cancellationToken = default)
        {
            _logger.LogDebug("Getting pending commands for PC {MCId}", MCId);

            var query = _context.AgentCommands
                .AsNoTracking() // Read-only for performance
                .Where(c => c.MCId == MCId && c.Status == "Pending");

            // Exclude specific command types (e.g., log file requests handled via WebSocket)
            if (excludedCommandTypes != null)
            {
                var excludedList = excludedCommandTypes.ToList();
                if (excludedList.Any())
                {
                    query = query.Where(c => !excludedList.Contains(c.CommandType));
                }
            }

            var commands = await query
                .OrderBy(c => c.CreatedDate)
                .ToListAsync(cancellationToken);

            _logger.LogDebug("Found {Count} pending commands for PC {MCId}", commands.Count, MCId);
            return commands;
        }

        /// <inheritdoc/>
        public async Task<int> MarkCommandsInProgressAsync(
            IEnumerable<int> commandIds,
            CancellationToken cancellationToken = default)
        {
            var idList = commandIds.ToList();
            if (!idList.Any())
            {
                return 0;
            }

            _logger.LogDebug("Marking {Count} commands as InProgress", idList.Count);

            // Atomic update: only updates commands that are still "Pending"
            // This prevents race conditions where two heartbeats try to pick up the same command
            var updated = await _context.AgentCommands
                .Where(c => idList.Contains(c.CommandId) && c.Status == "Pending")
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(c => c.Status, "InProgress")
                    .SetProperty(c => c.ExecutedDate, DateTime.Now),
                    cancellationToken);

            if (updated < idList.Count)
            {
                _logger.LogDebug(
                    "Only {Updated} of {Requested} commands were marked InProgress (others may have been claimed)",
                    updated,
                    idList.Count);
            }

            return updated;
        }

        /// <inheritdoc/>
        public async Task<AgentCommand?> GetByIdWithPCAsync(
            int commandId,
            CancellationToken cancellationToken = default)
        {
            return await _context.AgentCommands
                .Include(c => c.FactoryMC)
                .FirstOrDefaultAsync(c => c.CommandId == commandId, cancellationToken);
        }

        /// <inheritdoc/>
        public async Task<bool> UpdateCommandResultAsync(
            int commandId,
            string status,
            string? resultData,
            string? errorMessage,
            CancellationToken cancellationToken = default)
        {
            _logger.LogDebug("Updating command {CommandId} to status {Status}", commandId, status);

            var updated = await _context.AgentCommands
                .Where(c => c.CommandId == commandId)
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(c => c.Status, status)
                    .SetProperty(c => c.ResultData, resultData)
                    .SetProperty(c => c.ErrorMessage, errorMessage)
                    .SetProperty(c => c.ExecutedDate, DateTime.Now),
                    cancellationToken);

            if (updated == 0)
            {
                _logger.LogWarning("Command {CommandId} not found for result update", commandId);
                return false;
            }

            return true;
        }

        #endregion
    }
}
