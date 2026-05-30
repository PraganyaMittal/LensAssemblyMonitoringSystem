using System.ComponentModel.DataAnnotations;

namespace LensAssemblyMonitoringWeb.Features.Logs.Contracts
{
    public class LogStructureSyncRequest
        {
            /// <summary>
            /// Target MC identifier.
            /// </summary>
            /// <example>42</example>
            [Required]
            public int MCId { get; set; }
    
            /// <summary>
            /// JSON map tree of monitored directories and log files.
            /// </summary>
            /// <example>[{"name":"Inspection_NG_20260530","isDir":true,"files":[{"name":"cam_left.bmp","isDir":false}]}]</example>
            public string LogStructureJson { get; set; } = string.Empty;
        }

    public class ThumbnailUploadResponse
        {
            public string Message { get; set; } = string.Empty;
            public int Count { get; set; }
            public string? LogFileName { get; set; }
        }

    public class ThumbnailDto
        {
            public string? OperationName { get; set; }
            public string? NgPath { get; set; }
            public string Filename { get; set; } = string.Empty;
            public string Data { get; set; } = string.Empty;
        }

    public class ThumbnailResponse
        {
            public string LogFileName { get; set; } = string.Empty;
            public string? OperationName { get; set; }
            public string? BarrelId { get; set; }
            public List<ThumbnailDto> Thumbnails { get; set; } = new();
            public int Count { get; set; }
        }

    public class ThumbnailAvailabilityResponse
        {
            public string LogFileName { get; set; } = string.Empty;
            public bool Available { get; set; }
        }

    public class InspectionImageDto
        {
            public string Url { get; set; } = string.Empty;
            public string Filename { get; set; } = string.Empty;
        }

    public class InspectionImagesResponse
        {
            public List<InspectionImageDto> Images { get; set; } = new();
            public int Count { get; set; }
            public string? OperationName { get; set; }
        }

    public class LogFileContentResponse
        {
            public string FileName { get; set; } = string.Empty;
            public string FilePath { get; set; } = string.Empty;
            public string Content { get; set; } = string.Empty;
            public long Size { get; set; }
            public string Encoding { get; set; } = "UTF-8";
        }

    public class LogStructureResponse
        {
            [Newtonsoft.Json.JsonProperty("MCId")]
            public int MCId { get; set; }
    
            [Newtonsoft.Json.JsonProperty("rootPath")]
            public string RootPath { get; set; } = string.Empty;
    
            [Newtonsoft.Json.JsonProperty("files")]
            public object? Files { get; set; }
        }
}



