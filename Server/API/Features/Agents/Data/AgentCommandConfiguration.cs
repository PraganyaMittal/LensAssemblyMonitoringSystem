using LensAssemblyMonitoringWeb.Infrastructure.Persistence.Repositories;
using LensAssemblyMonitoringWeb.Features.Agents.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LensAssemblyMonitoringWeb.Features.Agents.Data
{
    public class AgentCommandConfiguration : IEntityTypeConfiguration<AgentCommand>
    {
        public void Configure(EntityTypeBuilder<AgentCommand> entity)
        {
            entity.HasIndex(a => new { a.MCId, a.Status });
        }
    }
}

