using FactoryMonitoringWeb.Services.Batching;

namespace FactoryMonitoringWeb.Services.Middleware
{
    /// <summary>
    /// Middleware that extracts or generates correlation IDs for distributed tracing.
    /// 
    /// Design Decision: Middleware pattern chosen because:
    /// 1. Runs before any controller logic
    /// 2. Can set context for the entire request pipeline
    /// 3. Can add response headers for client-side correlation
    /// 
    /// Usage: Add to pipeline in Program.cs before UseRouting()
    /// </summary>
    public class CorrelationIdMiddleware
    {
        private const string CorrelationIdHeader = "X-Correlation-ID";
        private readonly RequestDelegate _next;
        private readonly ILogger<CorrelationIdMiddleware> _logger;

        public CorrelationIdMiddleware(
            RequestDelegate next,
            ILogger<CorrelationIdMiddleware> logger)
        {
            _next = next ?? throw new ArgumentNullException(nameof(next));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public async Task InvokeAsync(HttpContext context)
        {
            // Extract correlation ID from request header or generate new one
            var correlationId = context.Request.Headers[CorrelationIdHeader].FirstOrDefault();

            if (string.IsNullOrWhiteSpace(correlationId))
            {
                correlationId = CorrelationContext.GenerateCorrelationId();
            }

            // Set in async-local context for cross-cutting access
            CorrelationContext.Set(correlationId);

            // Add to response headers for client-side correlation
            context.Response.OnStarting(() =>
            {
                context.Response.Headers[CorrelationIdHeader] = correlationId;
                return Task.CompletedTask;
            });

            // Add to HttpContext.Items for controller access
            context.Items["CorrelationId"] = correlationId;

            // Create logging scope with correlation ID
            using (_logger.BeginScope(new Dictionary<string, object>
            {
                ["CorrelationId"] = correlationId
            }))
            {
                _logger.LogDebug("Request started with correlation ID: {CorrelationId}", correlationId);

                try
                {
                    await _next(context);
                }
                finally
                {
                    CorrelationContext.Clear();
                }
            }
        }
    }

    /// <summary>
    /// Extension methods for registering correlation ID middleware.
    /// </summary>
    public static class CorrelationIdMiddlewareExtensions
    {
        /// <summary>
        /// Adds correlation ID middleware to the pipeline.
        /// Should be called before UseRouting() in Program.cs.
        /// </summary>
        public static IApplicationBuilder UseCorrelationId(this IApplicationBuilder builder)
        {
            return builder.UseMiddleware<CorrelationIdMiddleware>();
        }
    }
}
