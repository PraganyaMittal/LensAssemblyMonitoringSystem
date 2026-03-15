using FactoryMonitoringWeb.Data;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using System.Collections.Concurrent;
using System.Diagnostics;

namespace FactoryMonitoring.IntegrationTests
{
    
    
    
    
    [Collection("Database")]
    public class QuickPerformanceTests
    {
        private readonly DatabaseFixture _fixture;

        public QuickPerformanceTests(DatabaseFixture fixture)
        {
            _fixture = fixture;
        }

        
        
        
        
        [Fact]
        public async Task UpdateOnly_500Concurrent_365KB()
        {
            
            var pcIds = new List<int>();
            using (var ctx = _fixture.CreateContext())
            {
                pcIds = await ctx.FactoryMCs
                    .Where(p => p.LineNumber >= 9000)
                    .Select(p => p.MCId)
                    .ToListAsync();
            }

            Console.WriteLine($"\n{'=',-60}");
            Console.WriteLine($"QUICK PERFORMANCE TEST - UPDATE ONLY");
            Console.WriteLine($"{'=',-60}");
            Console.WriteLine($"Found {pcIds.Count} pre-seeded test PCs");

            if (pcIds.Count < 100)
            {
                Console.WriteLine("SKIP: Not enough test PCs. Run SQL to seed first.");
                return;
            }

            
            var json = new string('x', 365 * 1024);
            Console.WriteLine($"Payload size: {json.Length / 1024} KB");

            
            var errors = new ConcurrentBag<Exception>();
            var latencies = new ConcurrentBag<long>();
            var successCount = 0;

            Console.WriteLine($"\nStarting {pcIds.Count} CONCURRENT updates (max 100 parallel)...\n");

            
            var semaphore = new SemaphoreSlim(100, 100);
            
            var stopwatch = Stopwatch.StartNew();

            
            var tasks = pcIds.Select(async pcId =>
            {
                await semaphore.WaitAsync();
                var sw = Stopwatch.StartNew();
                try
                {
                    using var ctx = _fixture.CreateContext();
                    var pc = await ctx.FactoryMCs.FindAsync(pcId);
                    if (pc != null)
                    {
                        pc.LogStructureJson = json;
                        pc.LastUpdated = DateTime.Now;
                        await ctx.SaveChangesAsync();
                        Interlocked.Increment(ref successCount);
                    }
                }
                catch (Exception ex)
                {
                    errors.Add(ex);
                }
                finally
                {
                    sw.Stop();
                    latencies.Add(sw.ElapsedMilliseconds);
                    semaphore.Release();
                }
            });

            await Task.WhenAll(tasks);
            stopwatch.Stop();

            
            var sorted = latencies.OrderBy(l => l).ToList();
            var p95 = sorted[(int)(sorted.Count * 0.95)];
            var p99 = sorted[(int)(sorted.Count * 0.99)];

            Console.WriteLine($"{'=',-60}");
            Console.WriteLine($"RESULTS");
            Console.WriteLine($"{'=',-60}");
            Console.WriteLine($"Total time:     {stopwatch.ElapsedMilliseconds} ms");
            Console.WriteLine($"Success:        {successCount}/{pcIds.Count}");
            Console.WriteLine($"Errors:         {errors.Count}");
            Console.WriteLine($"Throughput:     {pcIds.Count / (stopwatch.ElapsedMilliseconds / 1000.0):F1} agents/sec");
            Console.WriteLine($"Avg latency:    {latencies.Average():F1} ms");
            Console.WriteLine($"P95 latency:    {p95} ms");  
            Console.WriteLine($"P99 latency:    {p99} ms");
            Console.WriteLine($"Max latency:    {latencies.Max()} ms");

            if (errors.Any())
            {
                Console.WriteLine($"\nFirst error: {errors.First().Message}");
            }

            
            errors.Should().BeEmpty("No errors expected");
            successCount.Should().Be(pcIds.Count, "All updates should succeed");
        }
    }
}
