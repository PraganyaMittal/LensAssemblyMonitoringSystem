using LensAssemblyMonitoringWeb.Models.Exceptions;
using LensAssemblyMonitoringWeb.Services.Batching;
using Microsoft.Extensions.DependencyInjection;

namespace LensAssemblyMonitoringWeb.Commands
{

    public interface ICommandDispatcher
    {

        Task<TResult> DispatchAsync<TResult>(ICommand<TResult> command, CancellationToken cancellationToken = default);
    }

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

            var handlerType = typeof(ICommandHandler<,>).MakeGenericType(commandType, typeof(TResult));

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
            catch (LensAssemblyMonitoringException)
            {
                
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

