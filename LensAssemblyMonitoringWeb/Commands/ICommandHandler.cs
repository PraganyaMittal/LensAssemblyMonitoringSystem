namespace LensAssemblyMonitoringWeb.Commands
{

    public interface ICommandHandler<in TCommand, TResult>
        where TCommand : ICommand<TResult>
    {

        Task<TResult> HandleAsync(TCommand command, CancellationToken cancellationToken = default);
    }

    public interface ICommandHandler<in TCommand> : ICommandHandler<TCommand, Unit>
        where TCommand : ICommand<Unit>
    {
    }
}

