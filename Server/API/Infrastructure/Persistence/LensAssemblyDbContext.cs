using LensAssemblyMonitoringWeb.Features.Agents.Domain;
using LensAssemblyMonitoringWeb.Features.Machines.Domain;
using LensAssemblyMonitoringWeb.Features.Models.Domain;
using LensAssemblyMonitoringWeb.Features.Updates.Domain;
using LensAssemblyMonitoringWeb.Features.Logs.Domain;
using LensAssemblyMonitoringWeb.Features.Yield.Domain;
using Microsoft.EntityFrameworkCore;

namespace LensAssemblyMonitoringWeb.Infrastructure.Persistence
{
    public class LensAssemblyDbContext : DbContext
    {
        public LensAssemblyDbContext(DbContextOptions<LensAssemblyDbContext> options) : base(options)
        {
        }

        public DbSet<LensAssemblyMC> LensAssemblyMCs { get; set; }
        public DbSet<MCLogStructure> MCLogStructures { get; set; }
        public DbSet<Model> Models { get; set; }
        public DbSet<ModelFile> ModelFiles { get; set; }
        public DbSet<AgentCommand> AgentCommands { get; set; }
        public DbSet<SystemLog> SystemLogs { get; set; }
        public DbSet<LineTargetModel> LineTargetModels { get; set; }
        public DbSet<YieldRecord> YieldRecords { get; set; }
        public DbSet<YieldAlert> YieldAlerts { get; set; }
        public DbSet<GenerationNo> GenerationNos { get; set; }
        public DbSet<UpdatePackage> UpdatePackages { get; set; }
        public DbSet<UpdateSchedule> UpdateSchedules { get; set; }
        public DbSet<UpdateDeployment> UpdateDeployments { get; set; }

        // Model Management
        public DbSet<LineBarrelConfig> LineBarrelConfigs { get; set; }
        public DbSet<MachinePickerConfig> MachinePickerConfigs { get; set; }
        public DbSet<ModelSyncHistory> ModelSyncHistories { get; set; }
        public DbSet<LineDeploymentHistory> LineDeploymentHistories { get; set; }
        public DbSet<LineModelMachineFile> LineModelMachineFiles { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);
            modelBuilder.ApplyConfigurationsFromAssembly(typeof(LensAssemblyDbContext).Assembly);
        }
    }
}



