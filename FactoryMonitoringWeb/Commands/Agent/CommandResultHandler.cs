using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Infrastructure;
using FactoryMonitoringWeb.Repositories;
using Microsoft.EntityFrameworkCore;

namespace FactoryMonitoringWeb.Commands.Agent
{
    /// <summary>
    /// Handles recording command results from agents.
    /// 
    /// Special handling for ResetAgent command:
    /// When completed, permanently deletes the PC and all related data.
    /// </summary>
    public class CommandResultHandler : ICommandHandler<CommandResultCommand, CommandResultResponse>
    {
        private readonly IAgentCommandRepository _commandRepository;
        private readonly IFactoryPCRepository _pcRepository;
        private readonly FactoryDbContext _context;
        private readonly ILogger<CommandResultHandler> _logger;

        public CommandResultHandler(
            IAgentCommandRepository commandRepository,
            IFactoryPCRepository pcRepository,
            FactoryDbContext context,
            ILogger<CommandResultHandler> logger)
        {
            _commandRepository = commandRepository ?? throw new ArgumentNullException(nameof(commandRepository));
            _pcRepository = pcRepository ?? throw new ArgumentNullException(nameof(pcRepository));
            _context = context ?? throw new ArgumentNullException(nameof(context));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public async Task<CommandResultResponse> HandleAsync(
            CommandResultCommand command,
            CancellationToken cancellationToken = default)
        {
            if (command == null)
            {
                throw new ArgumentNullException(nameof(command));
            }

            var correlationId = CorrelationContext.CorrelationId;

            _logger.LogDebug(
                "Recording command result: CommandId={CommandId}, Status={Status}",
                command.CommandId,
                command.Status);

            try
            {
                var agentCommand = await _commandRepository.GetByIdAsync(command.CommandId, cancellationToken);
                if (agentCommand == null)
                {
                    _logger.LogWarning("Command {CommandId} not found", command.CommandId);
                    return CommandResultResponse.NotFound();
                }

                // Update command status
                agentCommand.Status = command.Status;
                agentCommand.ResultData = command.ResultData;
                agentCommand.ErrorMessage = command.ErrorMessage;
                agentCommand.ExecutedDate = DateTime.Now;

                bool agentDeleted = false;

                // Special handling for ResetAgent command
                if (agentCommand.CommandType == "ResetAgent" && command.Status == "Completed")
                {
                    var pc = await _context.FactoryPCs
                        .Include(p => p.ConfigFile)
                        .Include(p => p.Models)
                        .FirstOrDefaultAsync(p => p.PCId == agentCommand.PCId, cancellationToken);

                    if (pc != null)
                    {
                        _context.FactoryPCs.Remove(pc);
                        agentDeleted = true;
                        _logger.LogInformation(
                            "PC {PCId} permanently deleted after ResetAgent confirmation",
                            pc.PCId);
                    }
                }

                await _context.SaveChangesAsync(cancellationToken);

                _logger.LogInformation(
                    "Command {CommandId} result recorded: {Status}",
                    command.CommandId,
                    command.Status);

                return CommandResultResponse.Succeeded(agentDeleted);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to record command result for {CommandId}", command.CommandId);
                return CommandResultResponse.Failed($"Failed to record result: {ex.Message}");
            }
        }
    }
}
