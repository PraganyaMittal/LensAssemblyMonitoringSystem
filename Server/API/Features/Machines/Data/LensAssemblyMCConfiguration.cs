using LensAssemblyMonitoringWeb.Infrastructure.Persistence.Repositories;
using LensAssemblyMonitoringWeb.Features.Logs.Domain;
using LensAssemblyMonitoringWeb.Features.Machines.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LensAssemblyMonitoringWeb.Features.Machines.Data
{
    public class LensAssemblyMCConfiguration : IEntityTypeConfiguration<LensAssemblyMC>
    {
        public void Configure(EntityTypeBuilder<LensAssemblyMC> entity)
        {
            entity.HasIndex(p => new { p.LineNumber, p.MCNumber, p.GenerationNo })
                .IsUnique()
                .HasFilter("[LifecycleState] <> 'Decommissioned'");

            entity.HasIndex(p => p.IPAddress)
                .IsUnique()
                .HasFilter("[LifecycleState] <> 'Decommissioned'");

            entity.HasOne(m => m.LogStructure)
                .WithOne(l => l.LensAssemblyMC)
                .HasForeignKey<MCLogStructure>(l => l.MCId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(p => p.LineNumber);
            entity.HasIndex(p => p.IsOnline);
            entity.HasIndex(p => p.LifecycleState);
        }
    }
}

