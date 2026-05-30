namespace LensAssemblyMonitoringWeb.Shared.Contracts
{
    public class BasicResponse
        {
            public bool Success { get; set; }
            public string Message { get; set; } = string.Empty;
        }

    public class ApiErrorResponse
        {
            /// <summary>Always <c>false</c> for error responses.</summary>
            /// <example>false</example>
            public bool Success { get; set; } = false;
    
            /// <summary>Human-readable description of the failure.</summary>
            /// <example>Model not found in library</example>
            public string Message { get; set; } = string.Empty;
    
            /// <summary>
            /// Machine-parseable snake_case error key.
            /// Callers should switch on this value rather than parsing <see cref="Message"/>.
            /// </summary>
            /// <example>model_not_found</example>
            public string? ErrorCode { get; set; }
        }

    public class ApiResponse
        {
            /// <summary>
            /// Indicates transactional success.
            /// </summary>
            /// <example>true</example>
            public bool Success { get; set; }
    
            /// <summary>
            /// Narrative response statement.
            /// </summary>
            /// <example>Operation completed successfully.</example>
            public string Message { get; set; } = string.Empty;
    
            /// <summary>
            /// Optional custom response payload.
            /// </summary>
            public object? Data { get; set; }
        }
}



