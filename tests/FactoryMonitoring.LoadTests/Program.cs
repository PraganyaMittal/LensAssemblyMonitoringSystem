using System.Diagnostics;
using System.Net.Http.Json;
using System.Text;

namespace FactoryMonitoring.LoadTests
{
    
    
    
    
    public class Program
    {
        private const string BASE_URL = "http://localhost:5000/api/agent";
        private const int PAYLOAD_SIZE_KB = 365;
        
        private const int TOTAL_SPREAD_TIME_MS = 100;
        private const int VERSION_WINDOW_MS = TOTAL_SPREAD_TIME_MS / 2;
        private const int MAX_LINES = 28;
        private const int MAX_PCS = 10;

        public static async Task Main(string[] args)
        {
            Console.WriteLine("=== Factory Agent Sync Spread Simulation ===");
            Console.WriteLine($"Payload size: {PAYLOAD_SIZE_KB} KB per agent");
            Console.WriteLine($"Total Spread Time: {TOTAL_SPREAD_TIME_MS / 1000} seconds");
            Console.WriteLine($"Version Window: {VERSION_WINDOW_MS / 1000} seconds");
            Console.WriteLine();

            var simulator = new AgentSimulator(BASE_URL);
            await simulator.RunSimulationAsync();
        }

        public class AgentSimulator
        {
            private readonly string _baseUrl;
            private readonly HttpClient _httpClient;

            public AgentSimulator(string baseUrl)
            {
                _baseUrl = baseUrl;
                _httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(60) };
            }

            public async Task RunSimulationAsync()
            {
                var agents = CreateAgentConfigs();

                Console.WriteLine($"Total agents to simulate: {agents.Count}");
                Console.WriteLine($"Payload per agent: {PAYLOAD_SIZE_KB} KB");
                Console.WriteLine($"Total data to send: {agents.Count * PAYLOAD_SIZE_KB / 1024.0:F1} MB");
                Console.WriteLine();

                
                Console.WriteLine("Step 1: Registering test PCs...");
                var registeredAgents = await RegisterAgentsAsync(agents);
                Console.WriteLine($"Registered {registeredAgents.Count} test PCs");
                Console.WriteLine();

                if (registeredAgents.Count == 0)
                {
                    Console.WriteLine("ERROR: No PCs were registered. Is the server running?");
                    return;
                }

                
                Console.WriteLine($"Step 2: Syncing log structures with {TOTAL_SPREAD_TIME_MS / 1000}-second spread...");
                Console.WriteLine("Press ENTER to start...");
                Console.ReadLine();

                await RunSyncTestAsync(registeredAgents);
            }

            private List<AgentConfig> CreateAgentConfigs()
            {
                var agents = new List<AgentConfig>();

                
                for (int line = 1; line <= 28; line++)
                {
                    for (int pc = 1; pc <= 10; pc++)
                    {
                        agents.Add(new AgentConfig(0, "3.5", line, pc, CalculateSpreadDelay("3.5", line, pc)));
                    }
                }

                
                for (int line = 1; line <= 22; line++)
                {
                    for (int pc = 1; pc <= 10; pc++)
                    {
                        agents.Add(new AgentConfig(0, "4.0", line, pc, CalculateSpreadDelay("4.0", line, pc)));
                    }
                }

                return agents;
            }

            private int CalculateSpreadDelay(string version, int line, int pc)
            {
                int versionOffset = version.StartsWith("4") ? VERSION_WINDOW_MS : 0;
                int msPerLine = VERSION_WINDOW_MS / MAX_LINES;
                int msPerPc = msPerLine / MAX_PCS;

                int lineSlot = (line - 1) * msPerLine;
                int pcSlot = (pc - 1) * msPerPc;

                return versionOffset + lineSlot + pcSlot;
            }

            private async Task<List<AgentConfig>> RegisterAgentsAsync(List<AgentConfig> agents)
            {
                var registered = new List<AgentConfig>();
                
                foreach (var agent in agents)
                {
                    try
                    {
                        var registerRequest = new
                        {
                            lineNumber = 100 + agent.Line,
                            pcNumber = agent.Pc,
                            ipAddress = $"10.0.{agent.Line}.{agent.Pc}",
                            configFilePath = "C:\\test\\config.ini",
                            logFolderPath = "C:\\test\\logs",
                            modelFolderPath = "C:\\test\\models",
                            modelVersion = agent.Version,
                            logStructureJson = ""
                        };

                        var response = await _httpClient.PostAsJsonAsync($"{_baseUrl}/register", registerRequest);
                        if (response.IsSuccessStatusCode)
                        {
                            var result = await response.Content.ReadFromJsonAsync<RegisterResponse>();
                            if (result != null && result.Success)
                            {
                                registered.Add(agent with { PcId = result.PcId });
                            }
                        }
                    }
                    catch {  }
                }
                return registered;
            }

            private async Task RunSyncTestAsync(List<AgentConfig> agents)
            {
                var stopwatch = Stopwatch.StartNew();
                var startTime = DateTime.Now;
                Console.WriteLine($"Simulation started at: {startTime:HH:mm:ss.fff}");

                var dummyPayload = GenerateDummyPayload();
                var successCount = 0;
                var failCount = 0;
                var tasks = new List<Task>();

                foreach (var agent in agents)
                {
                    var task = Task.Run(async () =>
                    {
                        await Task.Delay(agent.DelayMs);
                        
                        try
                        {
                            var request = new
                            {
                                pcId = agent.PcId,
                                logStructureJson = dummyPayload
                            };

                            var response = await _httpClient.PostAsJsonAsync($"{_baseUrl}/synclogs", request);
                            if (response.IsSuccessStatusCode)
                            {
                                Interlocked.Increment(ref successCount);
                                Console.WriteLine($"OK  | V{agent.Version} L{agent.Line,2} P{agent.Pc,2} | PC={agent.PcId} | {DateTime.Now:HH:mm:ss.fff}");
                            }
                            else
                            {
                                Interlocked.Increment(ref failCount);
                                Console.WriteLine($"ERR | V{agent.Version} L{agent.Line,2} P{agent.Pc,2} | Status={response.StatusCode}");
                            }
                        }
                        catch (Exception ex)
                        {
                            Interlocked.Increment(ref failCount);
                            Console.WriteLine($"ERR | V{agent.Version} L{agent.Line,2} P{agent.Pc,2} | {ex.Message}");
                        }
                    });
                    tasks.Add(task);
                }

                Console.WriteLine($"Scheduled {tasks.Count} syncs, waiting for completion...");
                await Task.WhenAll(tasks);
                stopwatch.Stop();

                Console.WriteLine();
                Console.WriteLine("=== Simulation Complete ===");
                Console.WriteLine($"Total agents: {agents.Count}");
                Console.WriteLine($"Successful: {successCount}");
                Console.WriteLine($"Failed: {failCount}");
                Console.WriteLine($"Total time: {stopwatch.ElapsedMilliseconds / 1000.0:F2} seconds");
                Console.WriteLine($"Requests/second: {successCount / (stopwatch.ElapsedMilliseconds / 1000.0):F1}");
            }

            private string GenerateDummyPayload()
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
        }

        public record AgentConfig(int PcId, string Version, int Line, int Pc, int DelayMs);
        public record RegisterResponse(bool Success, int PcId, string Message);
    }
}
