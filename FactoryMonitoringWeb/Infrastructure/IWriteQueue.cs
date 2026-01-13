namespace FactoryMonitoringWeb.Infrastructure
{
    /// <summary>
    /// Interface for a background write queue.
    /// Allows producers to enqueue items that will be processed in batches.
    /// </summary>
    /// <typeparam name="T">Type of item to queue</typeparam>
    public interface IWriteQueue<T>
    {
        /// <summary>
        /// Enqueues an item for processing.
        /// Returns immediately (fire-and-forget from caller's perspective).
        /// </summary>
        ValueTask EnqueueAsync(T item, CancellationToken cancellationToken = default);

        /// <summary>
        /// Reads a batch of items from the queue.
        /// </summary>
        /// <param name="batchSize">Maximum number of items to read</param>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>A list of items, or empty list if channel is completed</returns>
        IAsyncEnumerable<IReadOnlyList<T>> ReadBatchesAsync(
            int batchSize,
            TimeSpan batchWindow,
            CancellationToken cancellationToken);
        
        /// <summary>
        /// Gets current queue count (approximate).
        /// </summary>
        int Count { get; }
    }
}
