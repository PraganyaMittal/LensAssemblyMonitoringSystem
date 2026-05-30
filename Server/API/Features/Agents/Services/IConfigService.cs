using System.Threading.Tasks;

namespace LensAssemblyMonitoringWeb.Features.Agents.Services
{
    public interface IConfigService
    {
        Task<string> GetConfigContentAsync(int MCId, CancellationToken cancellationToken = default);
        bool CompleteConfigRequest(string requestId, string? configContent, string? errorMessage = null);
    }
}



