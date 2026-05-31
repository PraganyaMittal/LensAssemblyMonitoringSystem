using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;
using Newtonsoft.Json;
using LensAssemblyMonitoringWeb.Features.Agents.Hubs;

namespace LensAssemblyMonitoringWeb.Features.Agents.Services
{
    public class ConfigService : IConfigService
    {
        private readonly IHubContext<AgentHub> _hubContext;
        private readonly ILogger<ConfigService> _logger;
        private readonly ConcurrentDictionary<string, TaskCompletionSource<string>> _pendingRequests;
        private readonly TimeSpan _requestTimeout = TimeSpan.FromSeconds(30);

        public ConfigService(
            IHubContext<AgentHub> hubContext,
            ILogger<ConfigService> logger)
        {
            _hubContext = hubContext;
            _logger = logger;
            _pendingRequests = new ConcurrentDictionary<string, TaskCompletionSource<string>>();
        }

        /// <summary>
        /// Transient command: Sends a pure SignalR request to the agent to upload its config.
        /// No database row is created — the user is actively waiting for the response.
        /// </summary>
        public async Task<string> GetConfigContentAsync(int MCId, CancellationToken cancellationToken = default)
        {
            string requestId = Guid.NewGuid().ToString("N")[..16];
            var tcs = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
            _pendingRequests[requestId] = tcs;

            try
            {
                var commandData = JsonConvert.SerializeObject(new { RequestId = requestId });

                await _hubContext.Clients.Group(MCId.ToString())
                    .SendAsync("ReceiveCommand",
                        "UploadConfig",
                        commandData,
                        requestId,
                        cancellationToken);

                _logger.LogInformation("Sent transient UploadConfig request {RequestId} to MC {MCId} via SignalR", requestId, MCId);

                using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                timeoutCts.CancelAfter(_requestTimeout);

                using var reg = timeoutCts.Token.Register(() => 
                {
                    tcs.TrySetException(new TimeoutException("Agent did not upload config file within 30 seconds."));
                });

                return await tcs.Task;
            }
            catch (Exception ex) when (ex is not TimeoutException)
            {
                _logger.LogWarning(ex, "Failed to send UploadConfig request to MC {MCId} via SignalR", MCId);
                throw;
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



