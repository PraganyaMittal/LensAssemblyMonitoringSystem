using LensAssemblyMonitoringWeb.Data;
using LensAssemblyMonitoringWeb.Services;
using LensAssemblyMonitoringWeb.Controllers.Hubs;
using Microsoft.EntityFrameworkCore;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

using LensAssemblyMonitoringWeb.Commands;
using LensAssemblyMonitoringWeb.Commands.Agent;
using LensAssemblyMonitoringWeb.Commands.Log;
using LensAssemblyMonitoringWeb.Commands.Model;
using LensAssemblyMonitoringWeb.Commands.Update;
using LensAssemblyMonitoringWeb.Models.Configuration;
using LensAssemblyMonitoringWeb.Middleware;
using LensAssemblyMonitoringWeb.Services.Middleware;
using LensAssemblyMonitoringWeb.Data.Repositories;
using LensAssemblyMonitoringWeb.Services.Batching;
using LensAssemblyMonitoringWeb.Repositories;

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = null;
});

builder.Services.AddSignalR(options =>
{
    options.MaximumReceiveMessageSize = 50 * 1024 * 1024; 
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
    options.AddPolicy("AllowAll", policy =>
    {

        policy.SetIsOriginAllowed(_ => true)
              .AllowAnyMethod()
              .AllowAnyHeader()
              .AllowCredentials();
    });
});

builder.Services.AddSession(options =>
{
    options.IdleTimeout = TimeSpan.FromMinutes(30);
    options.Cookie.HttpOnly = true;
    options.Cookie.IsEssential = true;
});

builder.Services.AddHttpContextAccessor();

builder.Services.AddMemoryCache(options => {
    options.SizeLimit = 500 * 1024 * 1024;  
});

builder.Services.AddDistributedMemoryCache();

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
builder.Services.AddSingleton<LogRequestManager>();
builder.Services.AddSingleton<IConfigService, ConfigService>();
builder.Services.AddScoped<ICommandDeliveryService, CommandDeliveryService>();

builder.Services.AddScoped<ICommandHandler<RegisterAgentCommand, RegistrationResult>, RegisterAgentHandler>();
builder.Services.AddScoped<ICommandHandler<HeartbeatCommand, HeartbeatResult>, HeartbeatHandler>();

builder.Services.AddScoped<ICommandHandler<SyncLogStructureCommand, SyncLogStructureResult>, SyncLogStructureHandler>();

builder.Services.AddSingleton<LogStructureQueue>();

builder.Services.AddHostedService<LogStructureBatchProcessor>();

builder.Services.AddScoped<ICommandHandler<SyncModelsCommand, SyncModelsResult>, SyncModelsHandler>();

builder.Services.AddScoped<ICommandHandler<CommandResultCommand, CommandResultResponse>, CommandResultHandler>();

builder.Services.AddScoped<ICommandHandler<UploadPackageCommand, UploadPackageResult>, UploadPackageHandler>();

builder.Services.AddScoped<ICommandHandler<CreateScheduleCommand, CreateScheduleResult>, CreateScheduleHandler>();
builder.Services.AddScoped<ICommandHandler<CancelScheduleCommand, CancelScheduleResult>, CancelScheduleHandler>();

builder.Services.AddHostedService<UpdateSchedulerService>();

builder.Services.AddHostedService<LineDeploymentOrchestratorService>();

builder.Services.AddScoped<ILAIService, LAIService>();
builder.Services.AddScoped<IBundleService, BundleService>();

builder.Services.AddHostedService<PackageCleanupService>();

builder.Services.AddScoped<ICommandDispatcher, CommandDispatcher>();

builder.Services.AddSingleton<IYieldAlertService, YieldAlertService>();
builder.Services.AddScoped<IYieldRepository, YieldRepository>();

builder.Services.AddSingleton<IModelStorageService, FileSystemModelStorageService>();
builder.Services.AddSingleton<IModelValidationService, ModelValidationService>();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    try
    {
        var context = services.GetRequiredService<LensAssemblyDbContext>();
        
        context.Database.ExecuteSqlRaw(@"
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ModelVersions' and xtype='U')
            BEGIN
                CREATE TABLE [ModelVersions] (
                    [ModelVersionId] int NOT NULL IDENTITY,
                    [ModelFileId] int NOT NULL,
                    [VersionNumber] int NOT NULL,
                    [StoragePath] nvarchar(500) NOT NULL,
                    [Checksum] nvarchar(64) NOT NULL,
                    [FileSize] bigint NOT NULL DEFAULT 0,
                    [CreatedDate] datetime2 NOT NULL,
                    [CreatedBy] nvarchar(100) NULL,
                    [ChangeSummary] nvarchar(500) NULL,
                    CONSTRAINT [PK_ModelVersions] PRIMARY KEY ([ModelVersionId]),
                    CONSTRAINT [FK_ModelVersions_ModelFiles_ModelFileId] FOREIGN KEY ([ModelFileId]) REFERENCES [ModelFiles] ([ModelFileId]) ON DELETE CASCADE
                );
                CREATE UNIQUE INDEX [IX_ModelVersions_ModelFileId_VersionNumber] ON [ModelVersions] ([ModelFileId], [VersionNumber]);
            END
        ");

        context.Database.ExecuteSqlRaw(@"
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='UpdatePackages' and xtype='U')
            BEGIN
                CREATE TABLE [UpdatePackages] (
                    [UpdatePackageId] int NOT NULL IDENTITY,
                    [PackageName] nvarchar(200) NOT NULL,
                    [PackageType] nvarchar(20) NOT NULL,
                    [Version] nvarchar(50) NOT NULL,
                    [FileName] nvarchar(500) NOT NULL,
                    [StoragePath] nvarchar(1000) NOT NULL,
                    [FileSize] bigint NOT NULL,
                    [FileHash] nvarchar(128) NOT NULL,
                    [Description] nvarchar(2000) NULL,
                    [UploadedBy] nvarchar(100) NOT NULL,
                    [UploadedDate] datetime2 NOT NULL DEFAULT GETUTCDATE(),
                    [IsActive] bit NOT NULL DEFAULT 1,
                    [RowVersion] rowversion NOT NULL,
                    CONSTRAINT [PK_UpdatePackages] PRIMARY KEY ([UpdatePackageId])
                );
                CREATE UNIQUE INDEX [IX_UpdatePackages_Type_Version_Active] ON [UpdatePackages] ([PackageType], [Version]) WHERE [IsActive] = 1;
            END
        ");

        context.Database.ExecuteSqlRaw(@"
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='UpdateSchedules' and xtype='U')
            BEGIN
                CREATE TABLE [UpdateSchedules] (
                    [UpdateScheduleId] int NOT NULL IDENTITY,
                    [UpdatePackageId] int NOT NULL,
                    [ScheduleName] nvarchar(200) NOT NULL,
                    [TargetType] nvarchar(30) NOT NULL,
                    [TargetFilter] nvarchar(max) NULL,
                    [ScheduleType] nvarchar(20) NOT NULL,
                    [ScheduledTimeUtc] datetime2 NULL,
                    [Status] nvarchar(20) NOT NULL DEFAULT 'Pending',
                    [TotalTargetCount] int NOT NULL DEFAULT 0,
                    [CreatedBy] nvarchar(100) NOT NULL,
                    [CreatedDateUtc] datetime2 NOT NULL DEFAULT GETUTCDATE(),
                    [DispatchedDateUtc] datetime2 NULL,
                    [CompletedDateUtc] datetime2 NULL,
                    [CancelledBy] nvarchar(100) NULL,
                    [CancelledDateUtc] datetime2 NULL,
                    [IsActive] bit NOT NULL DEFAULT 1,
                    [RowVersion] rowversion NOT NULL,
                    CONSTRAINT [PK_UpdateSchedules] PRIMARY KEY ([UpdateScheduleId]),
                    CONSTRAINT [FK_UpdateSchedules_UpdatePackages] FOREIGN KEY ([UpdatePackageId]) REFERENCES [UpdatePackages] ([UpdatePackageId])
                );
                CREATE INDEX [IX_UpdateSchedules_Status] ON [UpdateSchedules] ([Status]);
                CREATE INDEX [IX_UpdateSchedules_ScheduleType_Status] ON [UpdateSchedules] ([ScheduleType], [Status]);
            END
        ");

        context.Database.ExecuteSqlRaw(@"
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='UpdateDeployments' and xtype='U')
            BEGIN
                CREATE TABLE [UpdateDeployments] (
                    [UpdateDeploymentId] int NOT NULL IDENTITY,
                    [UpdateScheduleId] int NOT NULL,
                    [MCId] int NOT NULL,
                    [AgentCommandId] int NULL,
                    [Status] nvarchar(20) NOT NULL DEFAULT 'Queued',
                    [AttemptCount] int NOT NULL DEFAULT 0,
                    [MaxAttempts] int NOT NULL DEFAULT 3,
                    [PreviousVersion] nvarchar(50) NULL,
                    [StartedDateUtc] datetime2 NULL,
                    [CompletedDateUtc] datetime2 NULL,
                    [ErrorMessage] nvarchar(2000) NULL,
                    [RowVersion] rowversion NOT NULL,
                    CONSTRAINT [PK_UpdateDeployments] PRIMARY KEY ([UpdateDeploymentId]),
                    CONSTRAINT [FK_UpdateDeployments_UpdateSchedules] FOREIGN KEY ([UpdateScheduleId]) REFERENCES [UpdateSchedules] ([UpdateScheduleId]),
                    CONSTRAINT [FK_UpdateDeployments_LensAssemblyMCs] FOREIGN KEY ([MCId]) REFERENCES [LensAssemblyMCs] ([MCId]),
                    CONSTRAINT [FK_UpdateDeployments_AgentCommands] FOREIGN KEY ([AgentCommandId]) REFERENCES [AgentCommands] ([CommandId]),
                    CONSTRAINT [UQ_UpdateDeployments_ScheduleMC] UNIQUE ([UpdateScheduleId], [MCId])
                );
                CREATE INDEX [IX_UpdateDeployments_ScheduleId] ON [UpdateDeployments] ([UpdateScheduleId]);
                CREATE INDEX [IX_UpdateDeployments_MCId] ON [UpdateDeployments] ([MCId]);
                CREATE INDEX [IX_UpdateDeployments_Status] ON [UpdateDeployments] ([Status]);
            END
        ");
    }
    catch (Exception ex)
    {
        var logger = services.GetRequiredService<ILogger<Program>>();
        logger.LogError(ex, "An error occurred creating the ModelVersions table.");
    }
}

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseGlobalExceptionHandler();

app.UseStaticFiles();

app.UseWebSockets();

app.UseCorrelationId();

app.UseRouting();

app.UseCors("AllowAll");

app.UseRateLimiter();

app.UseAuthorization();
app.UseSession();

app.MapHub<AgentHub>("/agentHub");
app.MapHub<YieldHub>("/yieldHub");

app.MapControllerRoute(
    name: "default",
    pattern: "{controller}/{action}/{id?}");

app.MapControllers();

app.MapFallbackToFile("index.html");
app.MapFallbackToFile("{**slug}", "index.html");

app.Run();

