using LensAssemblyMonitoringWeb.Features.Agents.Data;

namespace LensAssemblyMonitoringWeb.Features.Agents.Services
{
    public class AgentCommandCleanupService : BackgroundService
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly IConfiguration _configuration;
        private readonly ILogger<AgentCommandCleanupService> _logger;

        public AgentCommandCleanupService(
            IServiceScopeFactory scopeFactory,
            IConfiguration configuration,
            ILogger<AgentCommandCleanupService> logger)
        {
            _scopeFactory = scopeFactory;
            _configuration = configuration;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("AgentCommandCleanupService is starting.");

            // Run every 24 hours
            using var timer = new PeriodicTimer(TimeSpan.FromHours(24));

            do
            {
                try
                {
                    await RunCleanupAsync(stoppingToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error occurred executing AgentCommand cleanup.");
                }
            }
            while (await timer.WaitForNextTickAsync(stoppingToken));
        }

        private async Task RunCleanupAsync(CancellationToken ct)
        {
            var retentionDays = _configuration.GetValue<int>("AgentCommandCleanup:RetentionDays", 7);
            var cutoff = DateTime.UtcNow.AddDays(-retentionDays);

            using var scope = _scopeFactory.CreateScope();
            var repository = scope.ServiceProvider.GetRequiredService<IAgentCommandRepository>();

            int deletedCount = await repository.DeleteOldCommandsAsync(cutoff, ct);

            if (deletedCount > 0)
            {
                _logger.LogInformation(
                    "AgentCommands cleanup completed: deleted {Count} old commands (older than {Cutoff:yyyy-MM-dd}).",
                    deletedCount,
                    cutoff);
            }
            else
            {
                _logger.LogDebug("AgentCommands cleanup completed: no old commands found to delete.");
            }
        }
    }
}
