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
        public DbSet<ConfigFile> ConfigFiles { get; set; }
        public DbSet<Model> Models { get; set; }
        public DbSet<ModelFile> ModelFiles { get; set; }
        public DbSet<ModelDistribution> ModelDistributions { get; set; }
        public DbSet<AgentCommand> AgentCommands { get; set; }
        public DbSet<SystemLog> SystemLogs { get; set; }
        public DbSet<LineTargetModel> LineTargetModels { get; set; }
        public DbSet<ModelVersion> ModelVersions { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // Configure unique constraints
            modelBuilder.Entity<FactoryMC>()
                .HasIndex(p => new { p.LineNumber, p.MCNumber })
                .IsUnique();

            modelBuilder.Entity<Model>()
                .HasIndex(m => new { m.MCId, m.ModelName })
                .IsUnique();

            // Configure one-to-one relationship for ConfigFile
            modelBuilder.Entity<ConfigFile>()
                .HasOne(c => c.FactoryMC)
                .WithOne(p => p.ConfigFile)
                .HasForeignKey<ConfigFile>(c => c.MCId)
                .OnDelete(DeleteBehavior.Cascade);

            // Configure indexes for performance
            modelBuilder.Entity<FactoryMC>()
                .HasIndex(p => p.LineNumber);

            modelBuilder.Entity<FactoryMC>()
                .HasIndex(p => p.IsOnline);

            modelBuilder.Entity<ConfigFile>()
                .HasIndex(c => c.PendingUpdate);

            modelBuilder.Entity<AgentCommand>()
                .HasIndex(a => new { a.MCId, a.Status });

            modelBuilder.Entity<ModelDistribution>()
                .HasIndex(m => m.Status);

            // NEW: Model Versioning Configuration
            modelBuilder.Entity<ModelVersion>()
                .HasIndex(v => new { v.ModelFileId, v.VersionNumber })
                .IsUnique();
        }
    }
}
