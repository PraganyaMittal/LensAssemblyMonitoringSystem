using LensAssemblyMonitoringWeb.Infrastructure.Persistence.Repositories;
using LensAssemblyMonitoringWeb.Features.Models.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LensAssemblyMonitoringWeb.Features.Models.Data
{
    public class ModelConfiguration : IEntityTypeConfiguration<Model>
    {
        public void Configure(EntityTypeBuilder<Model> entity)
        {
            entity.HasIndex(m => new { m.MCId, m.ModelName }).IsUnique();
        }
    }

    public class ModelFileConfiguration : IEntityTypeConfiguration<ModelFile>
    {
        public void Configure(EntityTypeBuilder<ModelFile> entity)
        {
            entity.HasIndex(m => m.ModelName);
            entity.HasIndex(m => m.ContentHash);
        }
    }

    public class GenerationNoConfiguration : IEntityTypeConfiguration<GenerationNo>
    {
        public void Configure(EntityTypeBuilder<GenerationNo> entity)
        {
            entity.HasIndex(v => new { v.ModelFileId, v.VersionNumber }).IsUnique();
        }
    }

    public class LineBarrelConfigConfiguration : IEntityTypeConfiguration<LineBarrelConfig>
    {
        public void Configure(EntityTypeBuilder<LineBarrelConfig> entity)
        {
            entity.HasIndex(e => new { e.LineNumber, e.Version, e.ModelName }).IsUnique();
            entity.HasIndex(e => new { e.LineNumber, e.Version });
        }
    }

    public class MachinePickerConfigConfiguration : IEntityTypeConfiguration<MachinePickerConfig>
    {
        public void Configure(EntityTypeBuilder<MachinePickerConfig> entity)
        {
            entity.HasIndex(e => new { e.LineNumber, e.Version, e.ModelName, e.McNumber }).IsUnique();
            entity.HasIndex(e => new { e.LineNumber, e.Version, e.ModelName });
        }
    }

    public class ModelSyncHistoryConfiguration : IEntityTypeConfiguration<ModelSyncHistory>
    {
        public void Configure(EntityTypeBuilder<ModelSyncHistory> entity)
        {
            entity.HasIndex(e => new { e.LineNumber, e.ModelName });
        }
    }

    public class LineDeploymentHistoryConfiguration : IEntityTypeConfiguration<LineDeploymentHistory>
    {
        public void Configure(EntityTypeBuilder<LineDeploymentHistory> entity)
        {
            entity.HasIndex(e => new { e.LineNumber, e.Version });
        }
    }

    public class LineModelMachineFileConfiguration : IEntityTypeConfiguration<LineModelMachineFile>
    {
        public void Configure(EntityTypeBuilder<LineModelMachineFile> entity)
        {
            entity.HasIndex(e => new { e.LineNumber, e.Version, e.ModelName, e.McNumber }).IsUnique();
            entity.HasIndex(e => new { e.LineNumber, e.Version, e.ModelName });
        }
    }
}

