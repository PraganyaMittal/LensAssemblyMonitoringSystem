using System.Diagnostics;
using System.Net.Http.Json;
using System.Text;

/// <summary>
/// Simulates 500 agents sending 365KB log structure data with 20-second spread.
/// First registers all PCs, then syncs their log structures.
/// </summary>

const string BASE_URL = "http://localhost:5000/api/agent";
const int PAYLOAD_SIZE_KB = 365;
const int VERSION_WINDOW_MS = 10000;
const int MAX_LINES = 28;
const int MAX_PCS = 10;

Console.WriteLine("=== Factory Agent Sync Spread Simulation ===");
Console.WriteLine($"Payload size: {PAYLOAD_SIZE_KB} KB per agent");
Console.WriteLine($"Spread window: 20 seconds");
Console.WriteLine();

// Generate 365KB dummy JSON payload
string GenerateDummyPayload()
{
    var sb = new StringBuilder();
    sb.Append("[");
    int itemCount = 0;
    while (sb.Length < PAYLOAD_SIZE_KB * 1024)
    {
        if (itemCount > 0) sb.Append(",");
        sb.Append($"{{\"id\":{itemCount},\"name\":\"logfile_{itemCount}.log\",\"path\":\"logs/2026/01/{itemCount:D4}.log\",\"size\":{1024 + itemCount},\"date\":\"2026-01-12T12:00:00\"}}");
        itemCount++;
    }
    sb.Append("]");
    return sb.ToString();
}

// Calculate spread delay based on version, line, PC (same as C++ agent)
int CalculateSpreadDelay(string version, int line, int pc)
{
    int versionOffset = version.StartsWith("4") ? VERSION_WINDOW_MS : 0;
    int msPerLine = VERSION_WINDOW_MS / MAX_LINES;
    int msPerPc = msPerLine / MAX_PCS;
    
    int lineSlot = (line - 1) * msPerLine;
    int pcSlot = (pc - 1) * msPerPc;
    
    return versionOffset + lineSlot + pcSlot;
}

// Create all agent configs
var agents = new List<(int PcId, string Version, int Line, int Pc, int DelayMs)>();

// Version 3.5: 28 lines × 10 PCs = 280 agents
for (int line = 1; line <= 28; line++)
{
    for (int pc = 1; pc <= 10; pc++)
    {
        int delay = CalculateSpreadDelay("3.5", line, pc);
        agents.Add((0, "3.5", line, pc, delay));  // PcId will be assigned after registration
    }
}

// Version 4.0: 22 lines × 10 PCs = 220 agents
for (int line = 1; line <= 22; line++)
{
    for (int pc = 1; pc <= 10; pc++)
    {
        int delay = CalculateSpreadDelay("4.0", line, pc);
        agents.Add((0, "4.0", line, pc, delay));
    }
}

Console.WriteLine($"Total agents to simulate: {agents.Count}");
Console.WriteLine($"Payload per agent: {PAYLOAD_SIZE_KB} KB");
Console.WriteLine($"Total data to send: {agents.Count * PAYLOAD_SIZE_KB / 1024.0:F1} MB");
Console.WriteLine();

using var httpClient = new HttpClient();
httpClient.Timeout = TimeSpan.FromSeconds(60);

// Step 1: Register all test PCs first
Console.WriteLine("Step 1: Registering 500 test PCs...");
var registeredAgents = new List<(int PcId, string Version, int Line, int Pc, int DelayMs)>();

foreach (var agent in agents)
{
    try
    {
        var registerRequest = new
        {
            lineNumber = 100 + agent.Line,  // Use line 100+ to avoid conflict with real PCs
            pcNumber = agent.Pc,
            ipAddress = $"10.0.{agent.Line}.{agent.Pc}",
            configFilePath = "C:\\test\\config.ini",
            logFolderPath = "C:\\test\\logs",
            modelFolderPath = "C:\\test\\models",
            modelVersion = agent.Version
        };
        
        var response = await httpClient.PostAsJsonAsync($"{BASE_URL}/register", registerRequest);
        if (response.IsSuccessStatusCode)
        {
            var result = await response.Content.ReadFromJsonAsync<RegisterResponse>();
            if (result != null && result.Success)
            {
                registeredAgents.Add((result.PcId, agent.Version, agent.Line, agent.Pc, agent.DelayMs));
            }
        }
    }
    catch { }
}

Console.WriteLine($"Registered {registeredAgents.Count} test PCs");
Console.WriteLine();

if (registeredAgents.Count == 0)
{
    Console.WriteLine("ERROR: No PCs were registered. Is the server running?");
    return;
}

// Step 2: Sync log structures with spread timing
Console.WriteLine("Step 2: Syncing log structures with 20-second spread...");
Console.WriteLine("Press ENTER to start...");
Console.ReadLine();

var stopwatch = Stopwatch.StartNew();
var startTime = DateTime.Now;
Console.WriteLine($"Simulation started at: {startTime:HH:mm:ss.fff}");

var dummyPayload = GenerateDummyPayload();
Console.WriteLine($"Generated dummy payload: {dummyPayload.Length / 1024.0:F1} KB");
Console.WriteLine();

var successCount = 0;
var failCount = 0;
var tasks = new List<Task>();

foreach (var agent in registeredAgents)
{
    var agentCopy = agent;
    var task = Task.Run(async () =>
    {
        await Task.Delay(agentCopy.DelayMs);
        
        var sendTime = DateTime.Now;
        try
        {
            var request = new
            {
                pcId = agentCopy.PcId,
                logStructureJson = dummyPayload
            };
            
            var response = await httpClient.PostAsJsonAsync($"{BASE_URL}/synclogs", request);
            
            if (response.IsSuccessStatusCode)
            {
                Interlocked.Increment(ref successCount);
                Console.WriteLine($"OK  | V{agentCopy.Version} L{agentCopy.Line,2} P{agentCopy.Pc,2} | PC={agentCopy.PcId} | {sendTime:HH:mm:ss.fff}");
            }
            else
            {
                Interlocked.Increment(ref failCount);
                Console.WriteLine($"ERR | V{agentCopy.Version} L{agentCopy.Line,2} P{agentCopy.Pc,2} | Status={response.StatusCode}");
            }
        }
        catch (Exception ex)
        {
            Interlocked.Increment(ref failCount);
            Console.WriteLine($"ERR | V{agentCopy.Version} L{agentCopy.Line,2} P{agentCopy.Pc,2} | {ex.Message}");
        }
    });
    
    tasks.Add(task);
}

Console.WriteLine($"Scheduled {tasks.Count} syncs, waiting for completion...");
await Task.WhenAll(tasks);
stopwatch.Stop();

Console.WriteLine();
Console.WriteLine("=== Simulation Complete ===");
Console.WriteLine($"Total agents: {registeredAgents.Count}");
Console.WriteLine($"Successful: {successCount}");
Console.WriteLine($"Failed: {failCount}");
Console.WriteLine($"Total time: {stopwatch.ElapsedMilliseconds / 1000.0:F2} seconds");
Console.WriteLine($"Requests/second: {successCount / (stopwatch.ElapsedMilliseconds / 1000.0):F1}");
Console.WriteLine();
Console.WriteLine("Check server logs for [SYNC TIMING] entries.");

// Helper class for registration response
record RegisterResponse(bool Success, int PcId, string Message);
