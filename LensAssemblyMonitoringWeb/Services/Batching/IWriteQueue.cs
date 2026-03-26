namespace LensAssemblyMonitoringWeb.Services.Batching
{

    public interface IWriteQueue<T>
    {

        ValueTask EnqueueAsync(T item, CancellationToken cancellationToken = default);

        IAsyncEnumerable<IReadOnlyList<T>> ReadBatchesAsync(
            int batchSize,
            TimeSpan batchWindow,
            CancellationToken cancellationToken);

        int Count { get; }
    }
}

