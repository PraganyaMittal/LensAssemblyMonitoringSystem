using LensAssemblyMonitoringWeb.Features.Agents.Hubs;
using LensAssemblyMonitoringWeb.Features.Agents.Domain;
using LensAssemblyMonitoringWeb.Features.Agents.Data;
using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;

namespace LensAssemblyMonitoringWeb.Features.Agents.Services
{
    public class CommandDeliveryService : ICommandDeliveryService
    {
        private readonly IAgentCommandRepository _commandRepository;
        private readonly IHubContext<AgentHub> _hubContext;
        private readonly ILogger<CommandDeliveryService> _logger;

        // In-memory store for transient (no-DB) command responses
        private static readonly ConcurrentDictionary<string, TaskCompletionSource<string>> _transientRequests = new();

        public CommandDeliveryService(
            IAgentCommandRepository commandRepository,
            IHubContext<AgentHub> hubContext,
            ILogger<CommandDeliveryService> logger)
        {
            _commandRepository = commandRepository;
            _hubContext = hubContext;
            _logger = logger;
        }

        /// <summary>
        /// Persistent command: Writes to AgentCommands DB, then pushes via SignalR.
        /// If SignalR fails, the agent picks it up on its next heartbeat.
        /// </summary>
        public async Task<int> SendCommandAsync(int mcId, string commandType, string? commandData = null)
        {
            var command = new AgentCommand
            {
                MCId = mcId,
                CommandType = commandType,
                CommandData = commandData,
                Status = "Pending",
                CreatedDate = DateTime.UtcNow 
            };

            await _commandRepository.AddAsync(command);

            _logger.LogInformation("Queued {CommandType} command {CommandId} for MC {MCId}",
                commandType, command.CommandId, mcId);

            var groupName = mcId.ToString();
            try
            {
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
                await _hubContext.Clients.Group(groupName)
                    .SendAsync("ReceiveCommand",
                        command.CommandType,
                        command.CommandData ?? "",
                        command.CommandId.ToString(),
                        cts.Token);

                _logger.LogInformation("Pushed {CommandType} command {CommandId} to MC {MCId} via SignalR", 
                    commandType, command.CommandId, mcId);

                command.Status = "Delivered";
                await _commandRepository.UpdateAsync(command);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to push {CommandType} command {CommandId} to MC {MCId} via SignalR. It will be delivered on next heartbeat.", 
                    commandType, command.CommandId, mcId);
            }

            return command.CommandId;
        }

        /// <summary>
        /// Transient command: Pure SignalR push, NO database row.
        /// Returns a TransientCommandResult containing a RequestId and a TaskCompletionSource
        /// the caller can await. If the agent is offline, the SignalR send succeeds silently
        /// but the TCS will timeout.
        /// </summary>
        public async Task<TransientCommandResult> SendTransientCommandAsync(
            int mcId, string commandType, string? commandData = null, TimeSpan? timeout = null)
        {
            var requestId = Guid.NewGuid().ToString("N")[..16];
            var tcs = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);

            _transientRequests[requestId] = tcs;

            var effectiveTimeout = timeout ?? TimeSpan.FromSeconds(30);

            try
            {
                await _hubContext.Clients.Group(mcId.ToString())
                    .SendAsync("ReceiveCommand",
                        commandType,
                        commandData ?? "",
                        requestId);

                _logger.LogInformation(
                    "Sent transient {CommandType} request {RequestId} to MC {MCId} via SignalR (no DB)",
                    commandType, requestId, mcId);
            }
            catch (Exception ex)
            {
                _transientRequests.TryRemove(requestId, out _);
                _logger.LogWarning(ex, "Failed to send transient {CommandType} to MC {MCId}", commandType, mcId);
                throw;
            }

            // Set up auto-timeout to clean up the TCS if agent never responds
            _ = Task.Delay(effectiveTimeout).ContinueWith(_ =>
            {
                if (_transientRequests.TryRemove(requestId, out var expiredTcs))
                {
                    expiredTcs.TrySetException(new TimeoutException(
                        $"Agent MC {mcId} did not respond to {commandType} within {effectiveTimeout.TotalSeconds}s."));
                }
            });

            return new TransientCommandResult
            {
                RequestId = requestId,
                CompletionSource = tcs
            };
        }

        /// <summary>
        /// Called by agent-facing controllers when the agent sends back the result
        /// of a transient command. Returns false if no pending request was found.
        /// </summary>
        public static bool CompleteTransientRequest(string requestId, string resultData)
        {
            if (_transientRequests.TryRemove(requestId, out var tcs))
            {
                return tcs.TrySetResult(resultData);
            }
            return false;
        }

        /// <summary>
        /// Called when a transient command fails on the agent side.
        /// </summary>
        public static bool FailTransientRequest(string requestId, string errorMessage)
        {
            if (_transientRequests.TryRemove(requestId, out var tcs))
            {
                return tcs.TrySetException(new Exception(errorMessage));
            }
            return false;
        }
    }
}
