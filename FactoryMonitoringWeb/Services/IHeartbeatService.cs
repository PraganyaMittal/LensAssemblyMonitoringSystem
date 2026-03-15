using FactoryMonitoringWeb.Models.DTOs;

namespace FactoryMonitoringWeb.Services
{

    public interface IHeartbeatService
    {

        Task<HeartbeatResult> ProcessHeartbeatAsync(
            HeartbeatRequest request,
            CancellationToken cancellationToken = default);
    }

    public class HeartbeatResult
    {

        public bool Success { get; init; }

        public bool HasPendingCommands { get; init; }

        public IList<CommandInfo> Commands { get; init; } = new List<CommandInfo>();

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

