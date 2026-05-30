using LensAssemblyMonitoringWeb.Shared.Contracts;
using LensAssemblyMonitoringWeb.Features.Agents.Contracts;
using LensAssemblyMonitoringWeb.Features.Machines.Contracts;
using LensAssemblyMonitoringWeb.Features.Models.Contracts;
using LensAssemblyMonitoringWeb.Features.Updates.Contracts;
using LensAssemblyMonitoringWeb.Features.Logs.Contracts;
using LensAssemblyMonitoringWeb.Features.Yield.Contracts;

namespace LensAssemblyMonitoringWeb.Features.Agents.Services
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



