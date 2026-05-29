using Microsoft.OpenApi;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace LensAssemblyMonitoringWeb.Swagger
{
    public class RateLimitResponseOperationFilter : IOperationFilter
    {
        public void Apply(OpenApiOperation operation, OperationFilterContext context)
        {
            operation.Responses ??= new OpenApiResponses();
            operation.Responses.TryAdd("429", new OpenApiResponse
            {
                Description = "Too many requests. The API rate limiter rejected the request."
            });
        }
    }
}
