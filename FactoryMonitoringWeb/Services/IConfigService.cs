using System.Threading.Tasks;

namespace FactoryMonitoringWeb.Services
{
    public interface IConfigService
    {
        Task<string> GetConfigContentAsync(int MCId, CancellationToken cancellationToken = default);
        bool CompleteConfigRequest(string requestId, string configContent);
    }
}
