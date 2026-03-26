using LensAssemblyMonitoringWeb.Models.DTOs;

namespace LensAssemblyMonitoringWeb.Services
{

    public interface IAgentRegistrationService
    {

        Task<RegistrationResult> RegisterAgentAsync(
            AgentRegistrationRequest request,
            CancellationToken cancellationToken = default);
    }

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

