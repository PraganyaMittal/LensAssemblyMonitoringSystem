using System.Threading.Channels;

namespace FactoryMonitoringWeb.Services.Batching
{

    public class ChannelWriteQueue<T> : IWriteQueue<T>
    {
        private readonly Channel<T> _channel;
        private readonly ILogger _logger;

        public ChannelWriteQueue(
            int capacity,
            ILogger logger)
        {
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));

            var options = new BoundedChannelOptions(capacity)
            {
                FullMode = BoundedChannelFullMode.Wait, 
                SingleReader = true,                    
                SingleWriter = false                    
            };

            _channel = Channel.CreateBounded<T>(options);
        }

        public int Count => _channel.Reader.Count;

        public async ValueTask EnqueueAsync(T item, CancellationToken cancellationToken = default)
        {
            await _channel.Writer.WriteAsync(item, cancellationToken);
        }

        public async IAsyncEnumerable<IReadOnlyList<T>> ReadBatchesAsync(
            int batchSize,
            TimeSpan batchWindow,
            [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken)
        {
            var batch = new List<T>(batchSize);

            while (await _channel.Reader.WaitToReadAsync(cancellationToken))
            {
                
                if (_channel.Reader.TryRead(out var item))
                {
                    batch.Add(item);

                    
                    var timeoutCts = new CancellationTokenSource(batchWindow);
                    var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutCts.Token);

                    try
                    {
                        while (batch.Count < batchSize)
                        {
                            
                            if (_channel.Reader.TryRead(out var nextItem))
                            {
                                batch.Add(nextItem);
                            }
                            else
                            {
                                
                                try
                                {
                                    if (await _channel.Reader.WaitToReadAsync(linkedCts.Token))
                                    {
                                        if (_channel.Reader.TryRead(out var waitedItem))
                                        {
                                            batch.Add(waitedItem);
                                        }
                                    }
                                }
                                catch (OperationCanceledException)
                                {
                                    if (timeoutCts.Token.IsCancellationRequested)
                                    {
                                        
                                        break;
                                    }
                                    throw;
                                }
                            }
                        }
                    }
                    finally
                    {
                        timeoutCts.Dispose();
                        linkedCts.Dispose();
                    }

                    yield return batch;
                    batch = new List<T>(batchSize); 
                }
            }
        }
    }
}

