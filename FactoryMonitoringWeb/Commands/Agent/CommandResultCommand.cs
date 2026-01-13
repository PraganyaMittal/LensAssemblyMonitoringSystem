using FactoryMonitoringWeb.Repositories;

namespace FactoryMonitoringWeb.Commands.Agent
{
    /// <summary>
    /// Command to record the result of a command execution from agent.
    /// </summary>
    public class CommandResultCommand : ICommand<CommandResultResponse>
    {
        public int CommandId { get; }
        public string Status { get; }
        public string? ResultData { get; }
        public string? ErrorMessage { get; }

        public CommandResultCommand(int commandId, string status, string? resultData, string? errorMessage)
        {
            if (commandId <= 0)
            {
                throw new ArgumentException("Command ID must be positive", nameof(commandId));
            }
            if (string.IsNullOrEmpty(status))
            {
                throw new ArgumentNullException(nameof(status));
            }

            CommandId = commandId;
            Status = status;
            ResultData = resultData;
            ErrorMessage = errorMessage;
        }
    }

    /// <summary>
    /// Result of command result recording.
    /// </summary>
    public class CommandResultResponse
    {
        public bool Success { get; init; }
        public string Message { get; init; } = string.Empty;
        public bool AgentDeleted { get; init; }

        public static CommandResultResponse Succeeded(bool agentDeleted = false) => new()
        {
            Success = true,
            Message = agentDeleted ? "Command result recorded, agent deleted" : "Command result recorded",
            AgentDeleted = agentDeleted
        };

        public static CommandResultResponse NotFound() => new()
        {
            Success = false,
            Message = "Command not found"
        };

        public static CommandResultResponse Failed(string message) => new()
        {
            Success = false,
            Message = message
        };
    }
}
