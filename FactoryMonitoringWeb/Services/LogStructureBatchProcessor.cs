using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Infrastructure;
using Microsoft.EntityFrameworkCore;
using System.Diagnostics;

namespace FactoryMonitoringWeb.Services
{
    /// <summary>
    /// Background service that processes batched log structure updates.
    /// Improves performance by writing to DB in transactions rather than individually.
    /// </summary>
    public class LogStructureBatchProcessor : BackgroundService
    {
        private readonly LogStructureQueue _queue;
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<LogStructureBatchProcessor> _logger;

        // Configuration
        private const int BATCH_SIZE = 50;
        private readonly TimeSpan BATCH_WINDOW = TimeSpan.FromSeconds(1);

        public LogStructureBatchProcessor(
            LogStructureQueue queue,
            IServiceScopeFactory scopeFactory,
            ILogger<LogStructureBatchProcessor> logger)
        {
            _queue = queue;
            _scopeFactory = scopeFactory;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("LogStructureBatchProcessor started.");

            try
            {
                await foreach (var batch in _queue.ReadBatchesAsync(BATCH_SIZE, BATCH_WINDOW, stoppingToken))
                {
                    if (batch.Any())
                    {
                        await ProcessBatchAsync(batch, stoppingToken);
                    }
                }
            }
            catch (OperationCanceledException)
            {
                // Graceful shutdown
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Fatal error in LogStructureBatchProcessor");
            }
        }

        private async Task ProcessBatchAsync(IReadOnlyList<LogStructureUpdate> batch, CancellationToken cancellationToken)
        {
            var sw = Stopwatch.StartNew();
            _logger.LogInformation("Processing batch of {Count} items...", batch.Count);

            try
            {
                using var scope = _scopeFactory.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<FactoryDbContext>();

                // 1. Begin transaction
                await using var transaction = await context.Database.BeginTransactionAsync(cancellationToken);

                // 2. Load all entities involved in this batch efficiently
                var pcIds = batch.Select(x => x.PCId).Distinct().ToList();
                var pcs = await context.FactoryPCs
                    .Where(p => pcIds.Contains(p.PCId))
                    .ToDictionaryAsync(p => p.PCId, cancellationToken);

                // 3. Apply updates
                int updatedCount = 0;
                foreach (var item in batch)
                {
                    if (pcs.TryGetValue(item.PCId, out var pc))
                    {
                        pc.LogStructureJson = item.LogStructureJson;
                        pc.LastUpdated = DateTime.Now;
                        updatedCount++;
                    }
                    else
                    {
                        _logger.LogWarning("PC {PCId} not found during batch update", item.PCId);
                    }
                }

                // 4. Save and Commit
                if (updatedCount > 0)
                {
                    await context.SaveChangesAsync(cancellationToken);
                    await transaction.CommitAsync(cancellationToken);
                    
                    sw.Stop();
                    _logger.LogInformation(
                        "Batch committed: {Count} updates in {Time}ms ({Rate:F1} ops/sec)", 
                        updatedCount, 
                        sw.ElapsedMilliseconds, 
                        updatedCount / (sw.Elapsed.TotalSeconds));
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to process batch of {Count} items. Retrying individually not implemented yet.", batch.Count);
                // In production, we would add these back to a retry queue
            }
        }
    }
}
