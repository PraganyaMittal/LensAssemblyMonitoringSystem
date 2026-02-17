// Simple rate limit test — run with: dotnet run
using System;
using System.Net.Http;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Linq;
using System.Diagnostics;

class Program
{
    static async Task Main()
    {
        var client = new HttpClient();
        var url = "http://localhost:5000/api/Yield/summary";
        int total = 60;
        
        Console.WriteLine($"Firing {total} parallel requests to {url}...\n");
        var sw = Stopwatch.StartNew();
        
        var tasks = Enumerable.Range(1, total).Select(async i =>
        {
            var response = await client.GetAsync(url);
            return (Index: i, StatusCode: (int)response.StatusCode);
        }).ToList();

        var results = await Task.WhenAll(tasks);
        sw.Stop();

        foreach (var r in results.OrderBy(x => x.Index))
        {
            string label = r.StatusCode == 200 ? "200 OK" : $"{r.StatusCode} RATE LIMITED";
            Console.WriteLine($"  Request {r.Index,2}: {label}");
        }

        int pass = results.Count(r => r.StatusCode == 200);
        int blocked = results.Count(r => r.StatusCode == 429);
        int other = results.Count(r => r.StatusCode != 200 && r.StatusCode != 429);

        Console.WriteLine($"\n--- Results ---");
        Console.WriteLine($"  Total:        {total}");
        Console.WriteLine($"  Passed (200): {pass}");
        Console.WriteLine($"  Blocked(429): {blocked}");
        Console.WriteLine($"  Other:        {other}");
        Console.WriteLine($"  Time:         {sw.ElapsedMilliseconds}ms");
    }
}
