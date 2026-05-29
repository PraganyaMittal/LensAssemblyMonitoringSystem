using LensAssemblyMonitoringWeb.Models.Exceptions;
using System.Net;
using System.Text.Json;

namespace LensAssemblyMonitoringWeb.Middleware
{
    public class ExceptionHandlingMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly ILogger<ExceptionHandlingMiddleware> _logger;
        private readonly IHostEnvironment _env;

        public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger, IHostEnvironment env)
        {
            _next = next;
            _logger = logger;
            _env = env;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            try
            {
                await _next(context);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An unhandled exception has occurred while executing the request.");
                await HandleExceptionAsync(context, ex);
            }
        }

        private async Task HandleExceptionAsync(HttpContext context, Exception exception)
        {
            context.Response.ContentType = "application/json";

            var response = new 
            {
                Success = false,
                Message = exception.Message,
                ErrorCode = "INTERNAL_ERROR",
                Details = _env.IsDevelopment() ? exception.StackTrace : null
            };

            switch (exception)
            {
                case AgentNotFoundException _:
                    context.Response.StatusCode = (int)HttpStatusCode.NotFound;
                    break;
                case RegistrationFailedException _:
                case DomainValidationException _:
                    context.Response.StatusCode = (int)HttpStatusCode.BadRequest;
                    break;
                case CommandExecutionException _:
                case LensAssemblyMonitoringException _:
                    context.Response.StatusCode = (int)HttpStatusCode.UnprocessableEntity;
                    break;
                default:
                    context.Response.StatusCode = (int)HttpStatusCode.InternalServerError;
                    response = new
                    {
                        Success = false,
                        Message = "An internal server error occurred.",
                        ErrorCode = "INTERNAL_ERROR",
                        Details = _env.IsDevelopment() ? exception.ToString() : null
                    };
                    break;
            }

            if (exception is LensAssemblyMonitoringException factoryEx)
            {
                var customResponse = factoryEx.ToErrorResponse();
                var result = JsonSerializer.Serialize(new { Success = false, Data = customResponse }, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
                await context.Response.WriteAsync(result);
                return;
            }

            var jsonResult = JsonSerializer.Serialize(response, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
            await context.Response.WriteAsync(jsonResult);
        }
    }

    public static class ExceptionHandlingMiddlewareExtensions
    {
        public static IApplicationBuilder UseGlobalExceptionHandler(this IApplicationBuilder builder)
        {
            return builder.UseMiddleware<ExceptionHandlingMiddleware>();
        }
    }
}

