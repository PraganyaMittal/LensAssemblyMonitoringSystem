using LensAssemblyMonitoringWeb.Data;
using LensAssemblyMonitoringWeb.Services.Batching;
using LensAssemblyMonitoringWeb.Controllers.Hubs;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Diagnostics;
using LensAssemblyMonitoringWeb.Models;

namespace LensAssemblyMonitoringWeb.Services
{

    public class LogStructureBatchProcessor : BackgroundService
    {
        private readonly LogStructureQueue _queue;
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly IHubContext<AgentHub> _hubContext;
        private readonly ILogger<LogStructureBatchProcessor> _logger;

        private const int BATCH_SIZE = 50;
        private readonly TimeSpan BATCH_WINDOW = TimeSpan.FromSeconds(1);

        public LogStructureBatchProcessor(
            LogStructureQueue queue,
            IServiceScopeFactory scopeFactory,
            IHubContext<AgentHub> hubContext,
            ILogger<LogStructureBatchProcessor> logger)
        {
            _queue = queue;
            _scopeFactory = scopeFactory;
            _hubContext = hubContext;
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
                var context = scope.ServiceProvider.GetRequiredService<LensAssemblyDbContext>();

                await using var transaction = await context.Database.BeginTransactionAsync(cancellationToken);

                var mcIds = batch.Select(x => x.MCId).Distinct().ToList();
                var mcs = await context.LensAssemblyMCs
                    .Where(p => mcIds.Contains(p.MCId))
                    .ToDictionaryAsync(p => p.MCId, cancellationToken);

                var logStructures = await context.MCLogStructures
                    .Where(p => mcIds.Contains(p.MCId))
                    .ToDictionaryAsync(p => p.MCId, cancellationToken);

                int updatedCount = 0;
                foreach (var item in batch)
                {
                    if (mcs.TryGetValue(item.MCId, out var mc))
                    {
                        mc.LastUpdated = DateTime.Now;

                        if (logStructures.TryGetValue(item.MCId, out var logStruct))
                        {
                            logStruct.LogStructureJson = item.LogStructureJson;
                        }
                        else
                        {
                            context.MCLogStructures.Add(new MCLogStructure 
                            { 
                                MCId = item.MCId, 
                                LogStructureJson = item.LogStructureJson 
                            });
                        }
                        
                        updatedCount++;
                    }
                    else
                    {
                        _logger.LogWarning("MC {MCId} not found during batch update", item.MCId);
                    }
                }

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
                _logger.LogError(ex, "Failed to process batch of {Count} items.", batch.Count);

                var affectedMCIds = batch.Select(x => x.MCId).Distinct();
                
                foreach (var mcId in affectedMCIds)
                {
                    try
                    {

                        await _hubContext.Clients.Group(mcId.ToString()).SendAsync(
                            "RequestLogStructureSync", 
                            cancellationToken: cancellationToken);
                            
                        _logger.LogInformation("Sent recovery signal to Agent MC {MCId}", mcId);
                    }
                    catch (Exception signalREx)
                    {
                        _logger.LogError(signalREx, "Failed to send recovery signal to Agent MC {MCId}", mcId);
                    }
                }
            }
        }
    }
}

