using LensAssemblyMonitoringWeb.Infrastructure.Persistence.Repositories;
using LensAssemblyMonitoringWeb.Features.Updates.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LensAssemblyMonitoringWeb.Features.Updates.Data
{
    public class UpdatePackageConfiguration : IEntityTypeConfiguration<UpdatePackage>
    {
        public void Configure(EntityTypeBuilder<UpdatePackage> entity)
        {
            entity.Property(e => e.RowVersion).IsRowVersion();
            entity.HasIndex(e => new { e.PackageType, e.Version })
                .IsUnique()
                .HasFilter("[IsActive] = 1");
        }
    }

    public class UpdateScheduleConfiguration : IEntityTypeConfiguration<UpdateSchedule>
    {
        public void Configure(EntityTypeBuilder<UpdateSchedule> entity)
        {
            entity.Property(e => e.RowVersion).IsRowVersion();
            entity.HasIndex(e => e.Status);
            entity.HasIndex(e => new { e.ScheduleType, e.Status });

            entity.HasOne(s => s.OriginalSchedule)
                .WithMany()
                .HasForeignKey(s => s.OriginalScheduleId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(s => s.HaltedAtMC)
                .WithMany()
                .HasForeignKey(s => s.HaltedAtMCId)
                .OnDelete(DeleteBehavior.SetNull);
        }
    }

    public class UpdateDeploymentConfiguration : IEntityTypeConfiguration<UpdateDeployment>
    {
        public void Configure(EntityTypeBuilder<UpdateDeployment> entity)
        {
            entity.Property(e => e.RowVersion).IsRowVersion();
            entity.HasIndex(e => new { e.UpdateScheduleId, e.MCId }).IsUnique();
            entity.HasIndex(e => e.Status);
            entity.HasIndex(e => e.MCId);
        }
    }
}

