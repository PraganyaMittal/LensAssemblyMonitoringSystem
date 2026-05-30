using LensAssemblyMonitoringWeb.Infrastructure.Persistence;
using LensAssemblyMonitoringWeb.Features.Agents;
using LensAssemblyMonitoringWeb.Features.Agents.Hubs;
using LensAssemblyMonitoringWeb.Features.Logs;
using LensAssemblyMonitoringWeb.Features.Machines;
using LensAssemblyMonitoringWeb.Features.Models;
using LensAssemblyMonitoringWeb.Features.Updates;
using LensAssemblyMonitoringWeb.Features.Yield;
using LensAssemblyMonitoringWeb.Features.Yield.Hubs;
using Microsoft.EntityFrameworkCore;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using LensAssemblyMonitoringWeb.Shared.Commands;
using LensAssemblyMonitoringWeb.Infrastructure.Middleware;
using LensAssemblyMonitoringWeb.Infrastructure.Swagger;

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = null;
});

builder.Services.Configure<IISServerOptions>(options =>
{
    options.MaxRequestBodySize = null;
});

builder.Services.AddSignalR(options =>
{
    options.MaximumReceiveMessageSize = 50 * 1024 * 1024; 
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    var xmlFile = $"{System.Reflection.Assembly.GetExecutingAssembly().GetName().Name}.xml";
    var xmlPath = System.IO.Path.Combine(AppContext.BaseDirectory, xmlFile);
    if (System.IO.File.Exists(xmlPath))
    {
        c.IncludeXmlComments(xmlPath);
    }

    c.CustomOperationIds(apiDescription =>
    {
        var controller = apiDescription.ActionDescriptor.RouteValues["controller"] ?? "Api";
        var action = apiDescription.ActionDescriptor.RouteValues["action"] ?? apiDescription.HttpMethod ?? "Operation";
        return $"{controller}_{action}";
    });

    c.TagActionsBy(apiDescription =>
    {
        var controller = apiDescription.ActionDescriptor.RouteValues["controller"] ?? "Api";
        return new[] { controller };
    });

    c.OperationFilter<RateLimitResponseOperationFilter>();
});

builder.Services.AddControllers()
    .AddNewtonsoftJson(options =>
    {
        options.SerializerSettings.ReferenceLoopHandling =
            Newtonsoft.Json.ReferenceLoopHandling.Ignore;
        options.SerializerSettings.NullValueHandling =
            Newtonsoft.Json.NullValueHandling.Ignore;
        
        options.SerializerSettings.ContractResolver =
            new Newtonsoft.Json.Serialization.CamelCasePropertyNamesContractResolver();
    });

builder.Services.AddDbContext<LensAssemblyDbContext>(options =>
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowConfiguredOrigins", policy =>
    {
        var allowedOrigins = builder.Configuration
            .GetSection("Cors:AllowedOrigins")
            .Get<string[]>() ?? Array.Empty<string>();

        if (allowedOrigins.Length > 0)
        {
            policy.WithOrigins(allowedOrigins)
                .AllowAnyMethod()
                .AllowAnyHeader()
                .AllowCredentials();
            return;
        }

        if (builder.Environment.IsDevelopment())
        {
            policy.SetIsOriginAllowed(origin =>
                    Uri.TryCreate(origin, UriKind.Absolute, out var uri) &&
                    (uri.Host == "localhost" || uri.Host == "127.0.0.1"))
                .AllowAnyMethod()
                .AllowAnyHeader()
                .AllowCredentials();
            return;
        }

        policy.SetIsOriginAllowed(_ => false)
            .AllowAnyMethod()
            .AllowAnyHeader();
    });
});

builder.Services.AddHttpContextAccessor();

builder.Services.AddMemoryCache(options => {
    options.SizeLimit = 500 * 1024 * 1024;  
});

builder.Services.AddRateLimiter(options =>
{
    
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(
        httpContext => RateLimitPartition.GetSlidingWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new SlidingWindowRateLimiterOptions
            {
                PermitLimit = 100,
                Window = TimeSpan.FromSeconds(10),
                SegmentsPerWindow = 5,       
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                QueueLimit = 5               
            }));

    options.AddSlidingWindowLimiter("ui_polling", limiterOptions =>
    {
        limiterOptions.PermitLimit = 30;
        limiterOptions.Window = TimeSpan.FromSeconds(10);
        limiterOptions.SegmentsPerWindow = 5;
        limiterOptions.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        limiterOptions.QueueLimit = 2;
    });

    options.AddSlidingWindowLimiter("agent", limiterOptions =>
    {
        limiterOptions.PermitLimit = 200;
        limiterOptions.Window = TimeSpan.FromSeconds(10);
        limiterOptions.SegmentsPerWindow = 5;
        limiterOptions.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        limiterOptions.QueueLimit = 10;
    });

    options.OnRejected = async (context, cancellationToken) =>
    {
        context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        context.HttpContext.Response.ContentType = "application/json";

        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
        {
            context.HttpContext.Response.Headers.RetryAfter = retryAfter.TotalSeconds.ToString("F0");
        }

        await context.HttpContext.Response.WriteAsJsonAsync(new
        {
            error = "Too many requests. Please slow down.",
            retryAfterSeconds = context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var ra)
                ? (int)ra.TotalSeconds
                : 10
        }, cancellationToken);
    };
});

builder.Services.AddScoped<ICommandDispatcher, CommandDispatcher>();
builder.Services.AddMachineFeature();
builder.Services.AddAgentFeature();
builder.Services.AddModelFeature();
builder.Services.AddUpdateFeature();
builder.Services.AddLogFeature(builder.Configuration);
builder.Services.AddYieldFeature();

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
}

app.UseGlobalExceptionHandler();

app.UseStaticFiles();

app.UseWebSockets();

app.UseCorrelationId();

app.UseSwagger();
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "Factory Monitoring API v1");
});

app.UseRouting();

app.UseCors("AllowConfiguredOrigins");

app.UseRateLimiter();

app.UseAuthorization();

app.MapHub<AgentHub>("/agentHub");
app.MapHub<YieldHub>("/yieldHub");

app.MapControllers();

app.MapFallbackToFile("index.html");
app.MapFallbackToFile("{**slug}", "index.html");

app.Run();

