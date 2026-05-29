using LensAssemblyMonitoringWeb.Data;
using LensAssemblyMonitoringWeb.Services;
using LensAssemblyMonitoringWeb.Controllers.Hubs;
using Microsoft.EntityFrameworkCore;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

using LensAssemblyMonitoringWeb.Commands;
using LensAssemblyMonitoringWeb.Commands.Agent;

using LensAssemblyMonitoringWeb.Commands.Model;
using LensAssemblyMonitoringWeb.Commands.Update;
using LensAssemblyMonitoringWeb.Models.Configuration;
using LensAssemblyMonitoringWeb.Middleware;
using LensAssemblyMonitoringWeb.Services.Middleware;
using LensAssemblyMonitoringWeb.Data.Repositories;
using LensAssemblyMonitoringWeb.Services.Batching;
using LensAssemblyMonitoringWeb.Repositories;
using LensAssemblyMonitoringWeb.Swagger;

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

builder.Services.AddHostedService<HeartbeatMonitorService>();

builder.Services.Configure<LogSettings>(
    builder.Configuration.GetSection(LogSettings.SectionName));

builder.Services.AddScoped<ILensAssemblyMCRepository, LensAssemblyMCRepository>();
builder.Services.AddScoped<IAgentCommandRepository, AgentCommandRepository>();
builder.Services.AddScoped<IModelRepository, ModelRepository>();

builder.Services.AddSingleton<ILogCache>(sp =>
{
    var logger = sp.GetRequiredService<ILogger<LruSizeBasedLogCache>>();
    var config = sp.GetRequiredService<IConfiguration>();
    var settings = config.GetSection(LogSettings.SectionName).Get<LogSettings>() ?? new LogSettings();
    return new LruSizeBasedLogCache(logger, settings.CacheSizeLimitBytes);
});

builder.Services.AddScoped<IAgentRegistrationService, AgentRegistrationService>();
builder.Services.AddScoped<IHeartbeatService, HeartbeatService>();
builder.Services.AddSingleton<ILogService, LogService>();
builder.Services.AddSingleton<IImageService, ImageService>();
builder.Services.AddSingleton<IThumbnailCache, ThumbnailCache>();
builder.Services.AddSingleton<IFullImageCache, FullImageCache>(); 

builder.Services.AddSingleton<IConfigService, ConfigService>();
builder.Services.AddScoped<ICommandDeliveryService, CommandDeliveryService>();

builder.Services.AddScoped<ICommandHandler<RegisterAgentCommand, RegistrationResult>, RegisterAgentHandler>();
builder.Services.AddScoped<ICommandHandler<HeartbeatCommand, HeartbeatResult>, HeartbeatHandler>();
builder.Services.AddScoped<ICommandHandler<UpdateModelCommand, bool>, UpdateModelHandler>();


builder.Services.AddSingleton<LogStructureQueue>();

builder.Services.AddHostedService<LogStructureBatchProcessor>();

builder.Services.AddScoped<ICommandHandler<SyncModelsCommand, SyncModelsResult>, SyncModelsHandler>();

builder.Services.AddScoped<ICommandHandler<CommandResultCommand, CommandResultResponse>, CommandResultHandler>();

builder.Services.AddScoped<ICommandHandler<CreateScheduleCommand, CreateScheduleResult>, CreateScheduleHandler>();
builder.Services.AddScoped<ICommandHandler<CancelScheduleCommand, CancelScheduleResult>, CancelScheduleHandler>();
builder.Services.AddScoped<ICommandHandler<RollbackScheduleCommand, RollbackScheduleResult>, RollbackScheduleHandler>();

// NOTE: UpdateSchedulerService removed — it was a legacy duplicate of LineDeploymentOrchestratorService
// that lacked rollback awareness. It raced with LineDeploymentOrchestratorService on every 10s tick
// and always dispatched DeployBundle (ignoring IsRollback), overriding the correct rollback command.
// LineDeploymentOrchestratorService handles all dispatch logic including rollbacks correctly.
builder.Services.AddHostedService<LineDeploymentOrchestratorService>();

builder.Services.AddScoped<ILAIService, LAIService>();
builder.Services.AddScoped<IBundleService, BundleService>();
builder.Services.AddSingleton<ICredentialEncryptionService, CredentialEncryptionService>();

builder.Services.AddHostedService<PackageCleanupService>();

builder.Services.AddScoped<ICommandDispatcher, CommandDispatcher>();

builder.Services.AddSingleton<IYieldAlertService, YieldAlertService>();
builder.Services.AddScoped<IYieldRepository, YieldRepository>();

builder.Services.AddSingleton<IModelStorageService, FileSystemModelStorageService>();
builder.Services.AddSingleton<IModelValidationService, ModelValidationService>();

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

