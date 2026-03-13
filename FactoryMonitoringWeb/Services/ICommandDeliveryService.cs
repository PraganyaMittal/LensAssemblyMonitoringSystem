namespace FactoryMonitoringWeb.Services
{
    public interface ICommandDeliveryService
    {
        /// <summary>
        /// Saves a command to the database and attempts to push it immediately via SignalR.
        /// If the direct push fails, the command is left in Pending state for heartbeat fallback.
        /// </summary>
        /// <param name="mcId">The MC ID of the target agent</param>
        /// <param name="commandType">The type string of the command (e.g., 'UpdateConfig')</param>
        /// <param name="commandData">Optional JSON payload for the command</param>
        /// <returns>The generated CommandId</returns>
        Task<int> SendCommandAsync(int mcId, string commandType, string? commandData = null);
    }
}
