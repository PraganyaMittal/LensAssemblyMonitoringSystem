using System.Collections.Concurrent;
using LensAssemblyMonitoringWeb.Infrastructure.Persistence;
using LensAssemblyMonitoringWeb.Features.Agents.Domain;
using LensAssemblyMonitoringWeb.Features.Machines.Domain;
using LensAssemblyMonitoringWeb.Features.Models.Domain;
using LensAssemblyMonitoringWeb.Features.Updates.Domain;
using LensAssemblyMonitoringWeb.Features.Logs.Domain;
using LensAssemblyMonitoringWeb.Features.Yield.Domain;
using Microsoft.AspNetCore.SignalR;
using Newtonsoft.Json;
using LensAssemblyMonitoringWeb.Features.Agents.Hubs;
using LensAssemblyMonitoringWeb.Features.Yield.Hubs;

namespace LensAssemblyMonitoringWeb.Features.Agents.Services
{
    public class ConfigService : IConfigService
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly IHubContext<AgentHub> _hubContext;
        private readonly ILogger<ConfigService> _logger;
        private readonly ConcurrentDictionary<string, TaskCompletionSource<string>> _pendingRequests;
        private readonly TimeSpan _requestTimeout = TimeSpan.FromSeconds(30);

        public ConfigService(
            IServiceScopeFactory scopeFactory,
            IHubContext<AgentHub> hubContext,
            ILogger<ConfigService> logger)
        {
            _scopeFactory = scopeFactory;
            _hubContext = hubContext;
            _logger = logger;
            _pendingRequests = new ConcurrentDictionary<string, TaskCompletionSource<string>>();
        }

        public async Task<string> GetConfigContentAsync(int MCId, CancellationToken cancellationToken = default)
        {
            string requestId = Guid.NewGuid().ToString("N")[..16];
            var tcs = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
            _pendingRequests[requestId] = tcs;

            try
            {
                using var scope = _scopeFactory.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<LensAssemblyDbContext>();

                var mc = await context.LensAssemblyMCs.FindAsync(new object[] { MCId }, cancellationToken);
                if (mc == null) throw new Exception("PC not found.");

                var command = new AgentCommand
                {
                    MCId = MCId,
                    CommandType = "UploadConfig",
                    CommandData = JsonConvert.SerializeObject(new { RequestId = requestId }),
                    Status = "Pending",
                    CreatedDate = DateTime.Now
                };

                context.AgentCommands.Add(command);
                await context.SaveChangesAsync(cancellationToken);

                try
                {
                    await _hubContext.Clients.Group(MCId.ToString())
                        .SendAsync("ReceiveCommand",
                            command.CommandType,
                            command.CommandData,
                            command.CommandId.ToString(),
                            cancellationToken);
                            
                    command.Status = "Delivered";
                    await context.SaveChangesAsync(cancellationToken);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to push UploadConfig command to PC {MCId} via SignalR", MCId);
                }

                using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                timeoutCts.CancelAfter(_requestTimeout);

                using var reg = timeoutCts.Token.Register(() => 
                {
                    tcs.TrySetException(new TimeoutException("Agent did not upload config file within 30 seconds."));
                });

                return await tcs.Task;
            }
            finally
            {
                _pendingRequests.TryRemove(requestId, out _);
            }
        }

        public bool CompleteConfigRequest(string requestId, string? configContent, string? errorMessage = null)
        {
            if (_pendingRequests.TryRemove(requestId, out var tcs))
            {
                if (!string.IsNullOrEmpty(errorMessage))
                {
                    return tcs.TrySetException(new FileNotFoundException(errorMessage));
                }
                return tcs.TrySetResult(configContent ?? string.Empty);
            }
            return false;
        }
    }
}



