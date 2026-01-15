namespace FactoryMonitoringWeb.Commands
{
    /// <summary>
    /// Handles execution of a specific command type.
    /// 
    /// Design Decision: Separate handler per command type because:
    /// 1. Single Responsibility Principle - each handler does one thing
    /// 2. Open/Closed Principle - add new commands without modifying existing handlers
    /// 3. Testability - handlers can be unit tested in isolation
    /// 
    /// Pattern: Strategy Pattern combined with Command Pattern.
    /// The dispatcher selects the appropriate handler (strategy) based on command type.
    /// </summary>
    /// <typeparam name="TCommand">The command type this handler processes</typeparam>
    /// <typeparam name="TResult">The result type produced by handling the command</typeparam>
    public interface ICommandHandler<in TCommand, TResult>
        where TCommand : ICommand<TResult>
    {
        /// <summary>
        /// Handles the command asynchronously.
        /// </summary>
        /// <param name="command">The command to handle</param>
        /// <param name="cancellationToken">Cancellation token for async operations</param>
        /// <returns>The result of handling the command</returns>
        Task<TResult> HandleAsync(TCommand command, CancellationToken cancellationToken = default);
    }

    /// <summary>
    /// Handler for commands that don't return a value.
    /// </summary>
    /// <typeparam name="TCommand">The command type this handler processes</typeparam>
    public interface ICommandHandler<in TCommand> : ICommandHandler<TCommand, Unit>
        where TCommand : ICommand<Unit>
    {
    }
}
