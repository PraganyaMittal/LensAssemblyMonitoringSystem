using FactoryMonitoringWeb.Models.DTOs;

namespace FactoryMonitoringWeb.Services
{
    /// <summary>
    /// Service interface for agent registration business logic.
    /// 
    /// Design Decision: Separated from HTTP concerns because:
    /// 1. Single Responsibility - business logic only, no HTTP context
    /// 2. Testability - can be unit tested without mocking HTTP
    /// 3. Reusability - can be called from WebSocket, background jobs, etc.
    /// 
    /// Pattern: Service Layer - Defines application's boundary with a layer of
    /// services that establishes a set of available operations.
    /// </summary>
    public interface IAgentRegistrationService
    {
        /// <summary>
        /// Registers a new agent or updates an existing agent's information.
        /// 
        /// Business rules:
        /// 1. If agent exists (by Line/MC/Version), update its properties
        /// 2. If agent doesn't exist, create new record
        /// 3. Always set IsOnline = true and update LastHeartbeat
        /// </summary>
        /// <param name="request">Registration request from agent</param>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>Registration result with MC ID and status</returns>
        Task<RegistrationResult> RegisterAgentAsync(
            AgentRegistrationRequest request,
            CancellationToken cancellationToken = default);
    }

    /// <summary>
    /// Result of agent registration operation.
    /// Encapsulates both success and failure information.
    /// </summary>
    public class RegistrationResult
    {
        public bool Success { get; init; }
        public int MCId { get; init; }
        public int LineNumber { get; init; }
        public int MCNumber { get; init; }
        public string Message { get; init; } = string.Empty;
        public bool IsNewRegistration { get; init; }

        public static RegistrationResult Succeeded(int mcId, int lineNumber, int mcNumber, bool isNew) => new()
        {
            Success = true,
            MCId = mcId,
            LineNumber = lineNumber,
            MCNumber = mcNumber,
            Message = isNew ? "Registration successful" : "Re-registration successful",
            IsNewRegistration = isNew
        };

        public static RegistrationResult Failed(string message) => new()
        {
            Success = false,
            MCId = 0,
            LineNumber = 0,
            MCNumber = 0,
            Message = message,
            IsNewRegistration = false
        };
    }
}
