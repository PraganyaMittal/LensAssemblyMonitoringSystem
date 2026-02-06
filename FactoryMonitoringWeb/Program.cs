using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Services;
using FactoryMonitoringWeb.Controllers.Hubs;
using Microsoft.EntityFrameworkCore;

// New architecture namespaces
using FactoryMonitoringWeb.Commands;
using FactoryMonitoringWeb.Commands.Agent;
using FactoryMonitoringWeb.Commands.Config;
using FactoryMonitoringWeb.Commands.Log;
using FactoryMonitoringWeb.Commands.Model;
using FactoryMonitoringWeb.Models.Configuration;
using FactoryMonitoringWeb.Services.Middleware;
using FactoryMonitoringWeb.Data.Repositories;
using FactoryMonitoringWeb.Services.Batching;

var builder = WebApplication.CreateBuilder(args);

// =====================
// Services
// =====================

// Configure Kestrel for large image uploads (up to 100MB)
builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = 100 * 1024 * 1024; // 100 MB
});

// 2. Add SignalR Service with increased message size for large images
builder.Services.AddSignalR(options =>
{
    options.MaximumReceiveMessageSize = 50 * 1024 * 1024; // 50 MB
});

// API Controllers + JSON settings
builder.Services.AddControllers()
    .AddNewtonsoftJson(options =>
    {
        options.SerializerSettings.ReferenceLoopHandling =
            Newtonsoft.Json.ReferenceLoopHandling.Ignore;
        options.SerializerSettings.NullValueHandling =
            Newtonsoft.Json.NullValueHandling.Ignore;
        // Use camelCase for JSON property names (JavaScript convention)
        options.SerializerSettings.ContractResolver =
            new Newtonsoft.Json.Serialization.CamelCasePropertyNamesContractResolver();
    });

// DbContext
builder.Services.AddDbContext<FactoryDbContext>(options =>
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("DefaultConnection")));

// CORS (for API + Agent communication)
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

// Session
builder.Services.AddSession(options =>
{
    options.IdleTimeout = TimeSpan.FromMinutes(30);
    options.Cookie.HttpOnly = true;
    options.Cookie.IsEssential = true;
});

// Add HttpContextAccessor for getting base URL
builder.Services.AddHttpContextAccessor();

// Add Memory Cache for image caching (increased from 50MB to 500MB for raw BMPs)
builder.Services.AddMemoryCache(options => {
    options.SizeLimit = 500 * 1024 * 1024;  // 500 MB max cache size
});

// REQUIRED for Session: Add a distributed cache implementation (in-memory)
builder.Services.AddDistributedMemoryCache();

// Add Heartbeat Monitor Background Service
builder.Services.AddHostedService<HeartbeatMonitorService>();

// =====================
// New Architecture: Manual DI Registration
// Demonstrates Inversion of Control without framework magic
// =====================

// Configuration (bind from appsettings.json)
builder.Services.Configure<LogSettings>(
    builder.Configuration.GetSection(LogSettings.SectionName));

// Repositories (Scoped - one per request, shares DbContext)
builder.Services.AddScoped<IFactoryMCRepository, FactoryMCRepository>();
builder.Services.AddScoped<IAgentCommandRepository, AgentCommandRepository>();
builder.Services.AddScoped<IConfigRepository, ConfigRepository>();
builder.Services.AddScoped<IModelRepository, ModelRepository>();

// Log Cache (Singleton - shared across all requests for LRU efficiency)
builder.Services.AddSingleton<ILogCache>(sp =>
{
    var logger = sp.GetRequiredService<ILogger<LruSizeBasedLogCache>>();
    var config = sp.GetRequiredService<IConfiguration>();
    var settings = config.GetSection(LogSettings.SectionName).Get<LogSettings>() ?? new LogSettings();
    return new LruSizeBasedLogCache(logger, settings.CacheSizeLimitBytes);
});

// Services (Scoped - business logic layer)
builder.Services.AddScoped<IAgentRegistrationService, AgentRegistrationService>();
builder.Services.AddScoped<IHeartbeatService, HeartbeatService>();
builder.Services.AddSingleton<ILogService, LogService>();
builder.Services.AddSingleton<IImageService, ImageService>();
builder.Services.AddSingleton<IThumbnailCache, ThumbnailCache>();
builder.Services.AddSingleton<IFullImageCache, FullImageCache>(); // Registered
builder.Services.AddSingleton<LogRequestManager>();

// Command Handlers (Scoped - one per request)
builder.Services.AddScoped<ICommandHandler<RegisterAgentCommand, RegistrationResult>, RegisterAgentHandler>();
builder.Services.AddScoped<ICommandHandler<HeartbeatCommand, HeartbeatResult>, HeartbeatHandler>();

// Config CQRS Handlers (Command = Write, Query = Read)
builder.Services.AddScoped<ICommandHandler<SyncConfigCommand, SyncConfigResult>, SyncConfigHandler>();
builder.Services.AddScoped<ICommandHandler<GetPendingConfigQuery, PendingConfigResult>, GetPendingConfigHandler>();

// Log Command Handler
builder.Services.AddScoped<ICommandHandler<SyncLogStructureCommand, SyncLogStructureResult>, SyncLogStructureHandler>();

// Server-Side Batching Queue (Singleton - shared channel)
builder.Services.AddSingleton<LogStructureQueue>();

// Batch Processor Background Service
builder.Services.AddHostedService<LogStructureBatchProcessor>();

// Model Command Handler
builder.Services.AddScoped<ICommandHandler<SyncModelsCommand, SyncModelsResult>, SyncModelsHandler>();

// Command Result Handler
builder.Services.AddScoped<ICommandHandler<CommandResultCommand, CommandResultResponse>, CommandResultHandler>();

// Command Dispatcher (Scoped - resolves handlers from DI)
builder.Services.AddScoped<ICommandDispatcher, CommandDispatcher>();

var app = builder.Build();

// =====================
// Middleware pipeline
// =====================

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseStaticFiles();

// Correlation ID middleware for distributed tracing
// Must be before UseRouting to capture all requests
app.UseCorrelationId();

app.UseRouting();

app.UseCors("AllowAll");

app.UseAuthorization();
app.UseSession();

// 3. Map the SignalR Hub Endpoint
// This opens "wss://your-server.com/agentHub" for the C++ Agent
app.MapHub<AgentHub>("/agentHub");
app.MapHub<YieldHub>("/yieldHub");

// --- ROUTING FIX ---
// MVC Controllers (conventional routing) - for PCController etc.
app.MapControllerRoute(
    name: "default",
    pattern: "{controller}/{action}/{id?}");

// API Controllers (Attribute routing)
app.MapControllers();

// SPA Fallback: Serve index.html for any unknown routes (React Router)
// MUST be LAST so API routes are matched first
app.MapFallbackToFile("index.html");

app.Run();
