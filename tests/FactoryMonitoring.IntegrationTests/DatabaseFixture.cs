using FactoryMonitoringWeb.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace FactoryMonitoring.IntegrationTests
{
    
    
    
    
    public class DatabaseFixture : IDisposable
    {
        private readonly string _connectionString;
        public IServiceProvider ServiceProvider { get; }
        
        public DatabaseFixture()
        {
            
            
            _connectionString = "Server=(localdb)\\MSSQLLocalDB;Database=FactoryMonitoringDB;Trusted_Connection=True;TrustServerCertificate=True;Max Pool Size=200;MultipleActiveResultSets=True;";

            var services = new ServiceCollection();
            
            services.AddDbContext<FactoryDbContext>(options =>
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
            var context = scope.ServiceProvider.GetRequiredService<FactoryDbContext>();
            
            
            var canConnect = context.Database.CanConnect();
            Console.WriteLine($"[DATABASE] Connected to FactoryMonitoringDB: {canConnect}");
        }

        public FactoryDbContext CreateContext()
        {
            return ServiceProvider.CreateScope()
                .ServiceProvider.GetRequiredService<FactoryDbContext>();
        }

        public void Dispose()
        {
            
            Console.WriteLine("[DATABASE] Test completed - data remains in FactoryMonitoringDB");
        }
    }

    [CollectionDefinition("Database")]
    public class DatabaseCollection : ICollectionFixture<DatabaseFixture>
    {
    }
}
