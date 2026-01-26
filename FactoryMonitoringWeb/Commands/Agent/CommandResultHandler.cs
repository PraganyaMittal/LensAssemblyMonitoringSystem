using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Services.Batching;
using FactoryMonitoringWeb.Data.Repositories;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json; // REQUIRED: Added for deserializing command data

namespace FactoryMonitoringWeb.Commands.Agent
{
    /// <summary>
    /// Handles recording command results from agents.
    /// 
    /// Special handling for:
    /// 1. ResetAgent: Deletes the PC.
    /// 2. DeleteModel: Removes the model record from DB after Agent confirms deletion.
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

                // ---------------------------------------------------------
                // 1. Special Handling: ResetAgent (Deletes PC)
                // ---------------------------------------------------------
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
                        _logger.LogInformation("PC {PCId} permanently deleted after ResetAgent confirmation", pc.PCId);
                    }
                }

                // ---------------------------------------------------------
                // 2. Special Handling: DeleteModel (Deletes Model from DB)
                // ---------------------------------------------------------
                // FIX: When Agent confirms deletion, remove it from Server DB to keep sync
                if (agentCommand.CommandType == "DeleteModel" && command.Status == "Completed")
                {
                    try
                    {
                        // Deserialize the original command data to get the ModelName
                        // Structure was: { "ModelName": "..." }
                        dynamic? cmdData = JsonConvert.DeserializeObject(agentCommand.CommandData);
                        string modelName = cmdData?.ModelName ?? string.Empty;

                        var modelToRemove = await _context.Models
                            .FirstOrDefaultAsync(m => m.PCId == agentCommand.PCId && m.ModelName == modelName, cancellationToken);

                        if (modelToRemove != null)
                        {
                            _context.Models.Remove(modelToRemove);
                            _logger.LogInformation(
                                "Model '{ModelName}' removed from DB for PC {PCId} following successful deletion on agent.",
                                modelName,
                                agentCommand.PCId);
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error cleaning up model from DB after agent deletion for Command {CommandId}", command.CommandId);
                        // We don't fail the request here, as the agent part succeeded.
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