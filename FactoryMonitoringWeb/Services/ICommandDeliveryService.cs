namespace FactoryMonitoringWeb.Services
{
    public interface ICommandDeliveryService
    {

        Task<int> SendCommandAsync(int mcId, string commandType, string? commandData = null);
    }
}

