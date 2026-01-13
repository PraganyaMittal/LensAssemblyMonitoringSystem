using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Services;
using FactoryMonitoringWeb.Hubs; // <--- 1. Add namespace for AgentHub
using Microsoft.EntityFrameworkCore;

// New architecture namespaces
using FactoryMonitoringWeb.Commands;
using FactoryMonitoringWeb.Commands.Agent;
using FactoryMonitoringWeb.Commands.Config;
using FactoryMonitoringWeb.Commands.Log;
using FactoryMonitoringWeb.Commands.Model;
using FactoryMonitoringWeb.Configuration;
using FactoryMonitoringWeb.Middleware;
using FactoryMonitoringWeb.Repositories;
using FactoryMonitoringWeb.Services.Interfaces;
using FactoryMonitoringWeb.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

// =====================
// Services
// =====================

// 2. Add SignalR Service
builder.Services.AddSignalR();

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

// Add Memory Cache for log file caching (100 MB limit)
builder.Services.AddMemoryCache(options => {
    options.SizeLimit = 50 * 1024 * 1024;  // 50 MB max cache size
});

// Add Log Request Manager (singleton for request tracking and caching) - LEGACY
builder.Services.AddSingleton<LogRequestManager>();

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
builder.Services.AddScoped<IFactoryPCRepository, FactoryPCRepository>();
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
builder.Services.AddScoped<ILogService, LogService>();

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

// --- ROUTING FIX START ---
// This handles requests like "/api/PC/ChangeModel" by routing them to "PCController" -> "ChangeModel"
/*
app.MapControllerRoute(
    name: "api_default",
    pattern: "api/{controller}/{action}/{id?}");
*/
// --- ROUTING FIX END ---

// SPA Fallback: Serve index.html for any unknown routes (React Router)
app.MapFallbackToFile("index.html");

// API Controllers (Attribute routing)
app.MapControllers();

app.Run();