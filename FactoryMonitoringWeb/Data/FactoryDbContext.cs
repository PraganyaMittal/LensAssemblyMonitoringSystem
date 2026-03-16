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
        public DbSet<UpdatePackage> UpdatePackages { get; set; }
        public DbSet<UpdateSchedule> UpdateSchedules { get; set; }
        public DbSet<UpdateDeployment> UpdateDeployments { get; set; }

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

            
            modelBuilder.Entity<FactoryMC>()
                .HasIndex(p => p.LineNumber);

            modelBuilder.Entity<FactoryMC>()
                .HasIndex(p => p.IsOnline);

            modelBuilder.Entity<AgentCommand>()
                .HasIndex(a => new { a.MCId, a.Status });

        
            modelBuilder.Entity<ModelFile>()
                .HasIndex(m => m.ModelName);

            modelBuilder.Entity<ModelFile>()
                .HasIndex(m => m.ContentHash);

            modelBuilder.Entity<YieldRecord>()
                .HasIndex(y => new { y.MachineId, y.Date });

            
            modelBuilder.Entity<ModelVersion>()
                .HasIndex(v => new { v.ModelFileId, v.VersionNumber })
                .IsUnique();

            
            modelBuilder.Entity<UpdatePackage>(entity =>
            {
                entity.Property(e => e.RowVersion).IsRowVersion();
                entity.HasIndex(e => new { e.PackageType, e.Version })
                      .IsUnique()
                      .HasFilter("[IsActive] = 1");
            });

            
            modelBuilder.Entity<UpdateSchedule>(entity =>
            {
                entity.Property(e => e.RowVersion).IsRowVersion();
                entity.HasIndex(e => e.Status);
                entity.HasIndex(e => new { e.ScheduleType, e.Status });
            });

            
            modelBuilder.Entity<UpdateDeployment>(entity =>
            {
                entity.Property(e => e.RowVersion).IsRowVersion();
                entity.HasIndex(e => new { e.UpdateScheduleId, e.MCId })
                      .IsUnique();
                entity.HasIndex(e => e.Status);
                entity.HasIndex(e => e.MCId);
            });



            
            modelBuilder.Entity<UpdateSchedule>()
                .HasOne(s => s.OriginalSchedule)
                .WithMany()
                .HasForeignKey(s => s.OriginalScheduleId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<UpdateSchedule>()
                .HasOne(s => s.HaltedAtMC)
                .WithMany()
                .HasForeignKey(s => s.HaltedAtMCId)
                .OnDelete(DeleteBehavior.SetNull);
        }
    }
}

