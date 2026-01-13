namespace FactoryMonitoringWeb.Commands
{
    /// <summary>
    /// Marker interface for command objects in the CQRS-lite pattern.
    /// 
    /// Design Decision: Generic interface with result type parameter because:
    /// 1. Enables type-safe command handling
    /// 2. Allows compile-time validation of handler return types
    /// 3. Supports void-equivalent (Unit) for commands without results
    /// 
    /// Pattern: Command Pattern - Encapsulates a request as an object,
    /// thereby letting you parameterize clients with different requests.
    /// </summary>
    /// <typeparam name="TResult">The type of result the command produces</typeparam>
    public interface ICommand<TResult>
    {
        // Marker interface - no members required
        // Commands carry data as properties
    }

    /// <summary>
    /// Represents a command with no return value.
    /// Use Unit as TResult for void-equivalent semantics.
    /// </summary>
    public interface ICommand : ICommand<Unit>
    {
    }

    /// <summary>
    /// Unit type for commands that don't return a value.
    /// Analogous to void but usable as a generic type parameter.
    /// </summary>
    public readonly struct Unit : IEquatable<Unit>
    {
        public static readonly Unit Value = new Unit();

        public override bool Equals(object? obj) => obj is Unit;
        public bool Equals(Unit other) => true;
        public override int GetHashCode() => 0;
        public override string ToString() => "()";

        public static bool operator ==(Unit left, Unit right) => true;
        public static bool operator !=(Unit left, Unit right) => false;
    }
}
