using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Services.Batching;
using FactoryMonitoringWeb.Data.Repositories;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;

namespace FactoryMonitoringWeb.Commands.Agent
{
    /// <summary>
    /// Handles recording command results from agents.
    /// 
    /// Special handling for:
    /// 1. ResetAgent: Deletes the MC.
    /// 2. DeleteModel: Removes the model record from DB after Agent confirms deletion.
    /// </summary>
    public class CommandResultHandler : ICommandHandler<CommandResultCommand, CommandResultResponse>
    {
        private readonly IAgentCommandRepository _commandRepository;
        private readonly IFactoryMCRepository _mcRepository;
        private readonly FactoryDbContext _context;
        private readonly ILogger<CommandResultHandler> _logger;

        public CommandResultHandler(
            IAgentCommandRepository commandRepository,
            IFactoryMCRepository mcRepository,
            FactoryDbContext context,
            ILogger<CommandResultHandler> logger)
        {
            _commandRepository = commandRepository ?? throw new ArgumentNullException(nameof(commandRepository));
            _mcRepository = mcRepository ?? throw new ArgumentNullException(nameof(mcRepository));
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

                agentCommand.Status = command.Status;
                agentCommand.ResultData = command.ResultData;
                agentCommand.ErrorMessage = command.ErrorMessage;
                agentCommand.ExecutedDate = DateTime.Now;

                bool agentDeleted = false;

                // ---------------------------------------------------------
                // 1. Special Handling: ResetAgent (Deletes MC)
                // ---------------------------------------------------------
                if (agentCommand.CommandType == "ResetAgent" && command.Status == "Completed")
                {
                    var mc = await _context.FactoryMCs
                        .Include(p => p.ConfigFile)
                        .Include(p => p.Models)
                        .FirstOrDefaultAsync(p => p.MCId == agentCommand.MCId, cancellationToken);

                    if (mc != null)
                    {
                        _context.FactoryMCs.Remove(mc);
                        agentDeleted = true;
                        _logger.LogInformation("MC {MCId} permanently deleted after ResetAgent confirmation", mc.MCId);
                    }
                }

                // ---------------------------------------------------------
                // 2. Special Handling: DeleteModel (Deletes Model from DB)
                // ---------------------------------------------------------
                if (agentCommand.CommandType == "DeleteModel" && command.Status == "Completed")
                {
                    try
                    {
                        dynamic? cmdData = JsonConvert.DeserializeObject(agentCommand.CommandData);
                        string modelName = cmdData?.ModelName ?? string.Empty;

                        var modelToRemove = await _context.Models
                            .FirstOrDefaultAsync(m => m.MCId == agentCommand.MCId && m.ModelName == modelName, cancellationToken);

                        if (modelToRemove != null)
                        {
                            _context.Models.Remove(modelToRemove);
                            _logger.LogInformation(
                                "Model '{ModelName}' removed from DB for MC {MCId} following successful deletion on agent.",
                                modelName,
                                agentCommand.MCId);
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error cleaning up model from DB after agent deletion for Command {CommandId}", command.CommandId);
                    }
                }

                await _context.SaveChangesAsync(cancellationToken);

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