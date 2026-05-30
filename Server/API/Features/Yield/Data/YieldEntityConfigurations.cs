using LensAssemblyMonitoringWeb.Infrastructure.Persistence.Repositories;
using LensAssemblyMonitoringWeb.Features.Yield.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LensAssemblyMonitoringWeb.Features.Yield.Data
{
    public class YieldRecordConfiguration : IEntityTypeConfiguration<YieldRecord>
    {
        public void Configure(EntityTypeBuilder<YieldRecord> entity)
        {
            entity.HasIndex(y => new { y.MachineId, y.Date });
        }
    }
}

