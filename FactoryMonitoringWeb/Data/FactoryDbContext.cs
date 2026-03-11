using FactoryMonitoringWeb.Models;
using Microsoft.EntityFrameworkCore;

namespace FactoryMonitoringWeb.Data
{
    public class FactoryDbContext : DbContext
    {
        public FactoryDbContext(DbContextOptions<FactoryDbContext> options) : base(options)
        {
        }

        public DbSet<FactoryMC> FactoryMCs { get; set; }
        public DbSet<Model> Models { get; set; }
        public DbSet<ModelFile> ModelFiles { get; set; }
        public DbSet<AgentCommand> AgentCommands { get; set; }
        public DbSet<SystemLog> SystemLogs { get; set; }
        public DbSet<LineTargetModel> LineTargetModels { get; set; }
        public DbSet<YieldRecord> YieldRecords { get; set; }
        public DbSet<YieldAlert> YieldAlerts { get; set; }
        public DbSet<ModelVersion> ModelVersions { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            modelBuilder.Entity<FactoryMC>()
                .HasIndex(p => new { p.LineNumber, p.MCNumber, p.ModelVersion })
                .IsUnique();

            modelBuilder.Entity<FactoryMC>()
                .HasIndex(p => p.IPAddress)
                .IsUnique();

            modelBuilder.Entity<Model>()
                .HasIndex(m => new { m.MCId, m.ModelName })
                .IsUnique();

            // Configure indexes for performance
            modelBuilder.Entity<FactoryMC>()
                .HasIndex(p => p.LineNumber);

            modelBuilder.Entity<FactoryMC>()
                .HasIndex(p => p.IsOnline);



            modelBuilder.Entity<AgentCommand>()
                .HasIndex(a => new { a.MCId, a.Status });

        // ModelFiles indexes for deduplication and lookup
            modelBuilder.Entity<ModelFile>()
                .HasIndex(m => m.ModelName);

            modelBuilder.Entity<ModelFile>()
                .HasIndex(m => m.ContentHash);

            modelBuilder.Entity<YieldRecord>()
                .HasIndex(y => new { y.MachineId, y.Date });

            // NEW: Model Versioning Configuration
            modelBuilder.Entity<ModelVersion>()
                .HasIndex(v => new { v.ModelFileId, v.VersionNumber })
                .IsUnique();
        }
    }
}
