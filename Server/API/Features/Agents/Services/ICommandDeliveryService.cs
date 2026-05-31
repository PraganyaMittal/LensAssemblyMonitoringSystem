namespace LensAssemblyMonitoringWeb.Features.Agents.Services
{
    public interface ICommandDeliveryService
    {
        /// <summary>
        /// Persistent command: Writes to AgentCommands DB table, then pushes via SignalR.
        /// Use for state-altering commands (ApplyModel, DeleteModel, Decommission, etc.)
        /// </summary>
        Task<int> SendCommandAsync(int mcId, string commandType, string? commandData = null);

        /// <summary>
        /// Transient command: Pure SignalR push with in-memory TaskCompletionSource.
        /// No DB row is created. Use for read-only commands where the user is actively waiting
        /// (DownloadModel, etc.) If the agent is offline, this fails immediately.
        /// </summary>
        Task<TransientCommandResult> SendTransientCommandAsync(int mcId, string commandType, string? commandData = null, TimeSpan? timeout = null);
    }

    public class TransientCommandResult
    {
        public string RequestId { get; set; } = string.Empty;
        public TaskCompletionSource<string> CompletionSource { get; set; } = default!;
    }
}



