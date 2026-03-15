using FactoryMonitoringWeb.Services.Batching;

namespace FactoryMonitoringWeb.Services.Middleware
{

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
            
            var correlationId = context.Request.Headers[CorrelationIdHeader].FirstOrDefault();

            if (string.IsNullOrWhiteSpace(correlationId))
            {
                correlationId = CorrelationContext.GenerateCorrelationId();
            }

            
            CorrelationContext.Set(correlationId);

            
            context.Response.OnStarting(() =>
            {
                context.Response.Headers[CorrelationIdHeader] = correlationId;
                return Task.CompletedTask;
            });

            
            context.Items["CorrelationId"] = correlationId;

            
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

    public static class CorrelationIdMiddlewareExtensions
    {

        public static IApplicationBuilder UseCorrelationId(this IApplicationBuilder builder)
        {
            return builder.UseMiddleware<CorrelationIdMiddleware>();
        }
    }
}

