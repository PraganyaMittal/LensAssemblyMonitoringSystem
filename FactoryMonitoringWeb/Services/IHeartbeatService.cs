using FactoryMonitoringWeb.Models.DTOs;

namespace FactoryMonitoringWeb.Services
{
    /// <summary>
    /// Service interface for heartbeat processing business logic.
    /// 
    /// Design Decision: Heartbeat is the most throughput-critical operation:
    /// 1. Called every few seconds by potentially thousands of agents
    /// 2. Must update PC status and fetch pending commands atomically
    /// 3. Must handle concurrent requests efficiently
    /// 
    /// Performance Considerations:
    /// - Minimal database round-trips
    /// - No unnecessary data loading
    /// - Efficient batch operations
    /// </summary>
    public interface IHeartbeatService
    {
        /// <summary>
        /// Processes a heartbeat from an agent.
        /// 
        /// Business Logic:
        /// 1. Updates PC's LastHeartbeat and IsOnline status
        /// 2. Updates IsApplicationRunning flag
        /// 3. Fetches pending commands (excluding WebSocket-handled types)
        /// 4. Marks fetched commands as InProgress
        /// 
        /// Concurrency: Uses atomic operations to prevent race conditions
        /// when multiple heartbeats arrive simultaneously.
        /// </summary>
        /// <param name="request">Heartbeat request from agent</param>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>Heartbeat response with pending commands</returns>
        Task<HeartbeatResult> ProcessHeartbeatAsync(
            HeartbeatRequest request,
            CancellationToken cancellationToken = default);
    }

    /// <summary>
    /// Result of heartbeat processing operation.
    /// Contains both status and any pending commands for the agent.
    /// </summary>
    public class HeartbeatResult
    {
        /// <summary>
        /// Whether the heartbeat was processed successfully.
        /// </summary>
        public bool Success { get; init; }

        /// <summary>
        /// Whether there are pending commands to execute.
        /// </summary>
        public bool HasPendingCommands { get; init; }

        /// <summary>
        /// List of commands the agent should execute.
        /// </summary>
        public IList<CommandInfo> Commands { get; init; } = new List<CommandInfo>();

        /// <summary>
        /// Error message if processing failed.
        /// </summary>
        public string? ErrorMessage { get; init; }

        public static HeartbeatResult Succeeded(IList<CommandInfo> commands) => new()
        {
            Success = true,
            HasPendingCommands = commands.Count > 0,
            Commands = commands
        };

        public static HeartbeatResult Failed(string errorMessage) => new()
        {
            Success = false,
            HasPendingCommands = false,
            Commands = new List<CommandInfo>(),
            ErrorMessage = errorMessage
        };
    }
}
