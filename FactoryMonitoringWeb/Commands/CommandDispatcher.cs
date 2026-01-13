using FactoryMonitoringWeb.Exceptions;
using FactoryMonitoringWeb.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

namespace FactoryMonitoringWeb.Commands
{
    /// <summary>
    /// Dispatches commands to their appropriate handlers.
    /// 
    /// Design Decision: Manual DI-based dispatcher instead of MediatR because:
    /// 1. Demonstrates understanding of IoC and Service Location patterns
    /// 2. No external dependency required
    /// 3. Full control over handler resolution and execution pipeline
    /// 
    /// The dispatcher uses IServiceProvider to resolve handlers at runtime,
    /// enabling the Strategy pattern for command processing.
    /// </summary>
    public interface ICommandDispatcher
    {
        /// <summary>
        /// Dispatches a command to its registered handler.
        /// </summary>
        /// <typeparam name="TResult">The result type</typeparam>
        /// <param name="command">The command to dispatch</param>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>The result from the handler</returns>
        Task<TResult> DispatchAsync<TResult>(ICommand<TResult> command, CancellationToken cancellationToken = default);
    }

    /// <summary>
    /// Default implementation of command dispatcher using service provider.
    /// </summary>
    public class CommandDispatcher : ICommandDispatcher
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<CommandDispatcher> _logger;

        public CommandDispatcher(
            IServiceProvider serviceProvider,
            ILogger<CommandDispatcher> logger)
        {
            _serviceProvider = serviceProvider ?? throw new ArgumentNullException(nameof(serviceProvider));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        /// <inheritdoc/>
        public async Task<TResult> DispatchAsync<TResult>(
            ICommand<TResult> command,
            CancellationToken cancellationToken = default)
        {
            if (command == null)
            {
                throw new ArgumentNullException(nameof(command));
            }

            var commandType = command.GetType();
            var commandName = commandType.Name;
            var correlationId = CorrelationContext.CorrelationId;

            _logger.LogDebug(
                "Dispatching command {CommandName} with correlation ID {CorrelationId}",
                commandName,
                correlationId);

            // Build the handler type: ICommandHandler<TCommand, TResult>
            var handlerType = typeof(ICommandHandler<,>).MakeGenericType(commandType, typeof(TResult));

            // Resolve handler from DI container
            var handler = _serviceProvider.GetService(handlerType);

            if (handler == null)
            {
                _logger.LogError(
                    "No handler registered for command {CommandName}",
                    commandName);

                throw new CommandExecutionException(
                    commandId: null,
                    commandType: commandName,
                    reason: $"No handler registered for command type {commandName}",
                    correlationId: correlationId);
            }

            try
            {
                // Invoke HandleAsync via reflection
                var handleMethod = handlerType.GetMethod("HandleAsync");
                if (handleMethod == null)
                {
                    throw new InvalidOperationException($"HandleAsync method not found on handler for {commandName}");
                }

                var resultTask = (Task<TResult>?)handleMethod.Invoke(handler, new object[] { command, cancellationToken });
                if (resultTask == null)
                {
                    throw new InvalidOperationException($"Handler returned null task for {commandName}");
                }

                var result = await resultTask;

                _logger.LogDebug(
                    "Command {CommandName} completed successfully with correlation ID {CorrelationId}",
                    commandName,
                    correlationId);

                return result;
            }
            catch (FactoryMonitoringException)
            {
                // Re-throw domain exceptions as-is
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "Command {CommandName} failed with correlation ID {CorrelationId}",
                    commandName,
                    correlationId);

                throw new CommandExecutionException(
                    commandId: null,
                    commandType: commandName,
                    reason: ex.Message,
                    correlationId: correlationId,
                    innerException: ex);
            }
        }
    }
}
