using LensAssemblyMonitoringWeb.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace LensAssemblyMonitoring.IntegrationTests
{
    
    
    
    
    public class DatabaseFixture : IDisposable
    {
        private readonly string _connectionString;
        public IServiceProvider ServiceProvider { get; }
        
        public DatabaseFixture()
        {
            
            
            _connectionString = "Server=(localdb)\\MSSQLLocalDB;Database=LensAssemblyMonitoringDB;Trusted_Connection=True;TrustServerCertificate=True;Max Pool Size=200;MultipleActiveResultSets=True;";

            var services = new ServiceCollection();
            
            services.AddDbContext<LensAssemblyDbContext>(options =>
            {
                options.UseSqlServer(_connectionString, sqlOptions =>
                {
                    
                    sqlOptions.CommandTimeout(120);
                    sqlOptions.EnableRetryOnFailure(3);
                });
            });

            services.AddLogging(builder =>
            {
                builder.AddConsole();
                builder.SetMinimumLevel(LogLevel.Warning);
            });

            ServiceProvider = services.BuildServiceProvider();

            
            using var scope = ServiceProvider.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<LensAssemblyDbContext>();
            
            
            var canConnect = context.Database.CanConnect();
            Console.WriteLine($"[DATABASE] Connected to LensAssemblyMonitoringDB: {canConnect}");
        }

        public LensAssemblyDbContext CreateContext()
        {
            return ServiceProvider.CreateScope()
                .ServiceProvider.GetRequiredService<LensAssemblyDbContext>();
        }

        public void Dispose()
        {
            
            Console.WriteLine("[DATABASE] Test completed - data remains in LensAssemblyMonitoringDB");
        }
    }

    [CollectionDefinition("Database")]
    public class DatabaseCollection : ICollectionFixture<DatabaseFixture>
    {
    }
}
