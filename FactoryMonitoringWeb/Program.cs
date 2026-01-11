using FactoryMonitoringWeb.Data;
using FactoryMonitoringWeb.Services;
using FactoryMonitoringWeb.Hubs; // <--- 1. Add namespace for AgentHub
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// =====================
// Services
// =====================

// 2. Add SignalR Service
builder.Services.AddSignalR();

// MVC + JSON settings
builder.Services.AddControllersWithViews()
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

// Add Memory Cache for log file caching
builder.Services.AddMemoryCache();

// Add Log Request Manager (singleton for request tracking and caching)
builder.Services.AddSingleton<LogRequestManager>();

// Add Heartbeat Monitor Background Service
builder.Services.AddHostedService<HeartbeatMonitorService>();

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

app.UseRouting();

app.UseCors("AllowAll");

app.UseAuthorization();
app.UseSession();

// 3. Map the SignalR Hub Endpoint
// This opens "wss://your-server.com/agentHub" for the C++ Agent
app.MapHub<AgentHub>("/agentHub");

// --- ROUTING FIX START ---
// This handles requests like "/api/PC/ChangeModel" by routing them to "PCController" -> "ChangeModel"
app.MapControllerRoute(
    name: "api_default",
    pattern: "api/{controller}/{action}/{id?}");
// --- ROUTING FIX END ---

// Standard MVC route
app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

// API Controllers (Attribute routing)
app.MapControllers();

app.Run();