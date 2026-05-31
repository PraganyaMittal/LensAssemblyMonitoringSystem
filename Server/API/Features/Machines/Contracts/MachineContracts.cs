using LensAssemblyMonitoringWeb.Shared.Contracts;

namespace LensAssemblyMonitoringWeb.Features.Machines.Contracts
{
    public class McCommandResponse : BasicResponse
        {
            public int? CommandId { get; set; }
            public string? LifecycleState { get; set; }
            public bool? IsOffline { get; set; }
        }

    public class PcCurrentModelDto
        {
            public int? ModelId { get; set; }
            public string ModelName { get; set; } = string.Empty;
            public string ModelPath { get; set; } = string.Empty;
            public DateTime? LastUsed { get; set; }
        }

    public class PcAvailableModelDto
        {
            public int ModelId { get; set; }
            public string ModelName { get; set; } = string.Empty;
            public string ModelPath { get; set; } = string.Empty;
            public bool IsCurrentModel { get; set; }
            public DateTime DiscoveredDate { get; set; }
            public DateTime? LastUsed { get; set; }
        }

    public class PcSummaryDto
        {
            public int MCId { get; set; }
            public int LineNumber { get; set; }
            public int MCNumber { get; set; }
            public string IPAddress { get; set; } = string.Empty;
            public string GenerationNo { get; set; } = string.Empty;
            public bool IsOnline { get; set; }
            public bool IsApplicationRunning { get; set; }
            public string LifecycleState { get; set; } = string.Empty;
            public string? AgentVersion { get; set; }
            public string? ServiceVersion { get; set; }
            public DateTime? LastHeartbeat { get; set; }
            public PcCurrentModelDto? CurrentModel { get; set; }
            public int ModelCount { get; set; }
        }

    public class PcLineGroupDto
        {
            public int LineNumber { get; set; }
            public string? TargetModelName { get; set; }
            public List<PcSummaryDto> Pcs { get; set; } = new();
        }

    public class PcListResponseDto
        {
            public int Total { get; set; }
            public int Online { get; set; }
            public int Offline { get; set; }
            public List<PcLineGroupDto> Lines { get; set; } = new();
        }

    public class PcConfigDto
        {
            public string ConfigContent { get; set; } = string.Empty;
            public DateTime? LastModified { get; set; }
        }

    public class PcDetailsResponseDto : PcSummaryDto
        {
            public string ConfigFilePath { get; set; } = string.Empty;
            public string LogFolderPath { get; set; } = string.Empty;
            public string ModelFolderPath { get; set; } = string.Empty;
            public string? LifecycleError { get; set; }
            public DateTime RegisteredDate { get; set; }
            public List<PcAvailableModelDto> AvailableModels { get; set; } = new();
            public PcConfigDto? Config { get; set; }
        }

    public class VersionCountDto
        {
            public string Version { get; set; } = string.Empty;
            public int Count { get; set; }
        }

    public class LineCountDto
        {
            public int Line { get; set; }
            public int Count { get; set; }
        }

    public class NetworkStatsResponseDto
        {
            public int TotalPCs { get; set; }
            public int OnlinePCs { get; set; }
            public int OfflinePCs { get; set; }
            public int RunningApps { get; set; }
            public List<VersionCountDto> Versions { get; set; } = new();
            public List<LineCountDto> Lines { get; set; } = new();
        }
}



