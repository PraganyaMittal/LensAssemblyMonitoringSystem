using FactoryMonitoringWeb.Commands;
using FactoryMonitoringWeb.Commands.Update;
using FactoryMonitoringWeb.Data;
using Microsoft.EntityFrameworkCore;

namespace FactoryMonitoringWeb.Services
{
    /// <summary>
    /// Background service that checks for due scheduled deployments every 30 seconds.
    /// When a schedule's ScheduledTimeUtc has passed and Status is still "Pending",
    /// it dispatches the schedule to agents.
    /// </summary>
    public class UpdateSchedulerService : BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<UpdateSchedulerService> _logger;
        private static readonly TimeSpan CheckInterval = TimeSpan.FromSeconds(30);

        public UpdateSchedulerService(
            IServiceProvider serviceProvider,
            ILogger<UpdateSchedulerService> logger)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("UpdateSchedulerService started — checking every {Interval}s",
                CheckInterval.TotalSeconds);

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await CheckDueSchedulesAsync(stoppingToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error checking due schedules");
                }

                await Task.Delay(CheckInterval, stoppingToken);
            }
        }

        private async Task CheckDueSchedulesAsync(CancellationToken ct)
        {
            using var scope = _serviceProvider.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<FactoryDbContext>();
            var handler = scope.ServiceProvider.GetRequiredService<
                ICommandHandler<CreateScheduleCommand, CreateScheduleResult>>();

            // Find schedules that are due
            var dueSchedules = await context.UpdateSchedules
                .Include(s => s.UpdatePackage)
                .Where(s => s.ScheduleType == "Scheduled"
                         && s.Status == "Pending"
                         && s.ScheduledTimeUtc != null
                         && s.ScheduledTimeUtc <= DateTime.UtcNow)
                .ToListAsync(ct);

            if (!dueSchedules.Any()) return;

            _logger.LogInformation("Found {Count} due schedules to dispatch", dueSchedules.Count);

            foreach (var schedule in dueSchedules)
            {
                if (schedule.UpdatePackage == null) continue;

                try
                {
                    // Reuse the dispatch logic from CreateScheduleHandler
                    var createHandler = handler as CreateScheduleHandler;
                    if (createHandler != null)
                    {
                        await createHandler.DispatchScheduleAsync(
                            schedule.UpdateScheduleId, schedule.UpdatePackage, ct);

                        _logger.LogInformation(
                            "Scheduled deployment dispatched: Id={Id}, {Name}",
                            schedule.UpdateScheduleId, schedule.ScheduleName);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex,
                        "Failed to dispatch scheduled deployment {Id}", schedule.UpdateScheduleId);

                    // Mark as failed so we don't retry indefinitely
                    schedule.Status = "Failed";
                    await context.SaveChangesAsync(ct);
                }
            }
        }
    }
}
