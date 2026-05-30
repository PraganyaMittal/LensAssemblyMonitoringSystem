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

namespace LensAssemblyMonitoringWeb.Features.Agents.Data
{

    public class AgentCommandRepository : IAgentCommandRepository
    {
        private readonly LensAssemblyDbContext _context;
        private readonly ILogger<AgentCommandRepository> _logger;

        public AgentCommandRepository(
            LensAssemblyDbContext context,
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

        public async Task<IList<AgentCommand>> GetPendingCommandsAsync(
            int MCId,
            IEnumerable<string>? excludedCommandTypes = null,
            CancellationToken cancellationToken = default)
        {
            _logger.LogDebug("Getting pending commands for MC {MCId}", MCId);

            var query = _context.AgentCommands
                .AsNoTracking() 
                .Where(c => c.MCId == MCId && c.Status == "Pending");

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

            _logger.LogDebug("Found {Count} pending commands for MC {MCId}", commands.Count, MCId);
            return commands;
        }

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

        public async Task<AgentCommand?> GetByIdWithMCAsync(
            int commandId,
            CancellationToken cancellationToken = default)
        {
            return await _context.AgentCommands
                .Include(c => c.LensAssemblyMC)
                .FirstOrDefaultAsync(c => c.CommandId == commandId, cancellationToken);
        }

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




