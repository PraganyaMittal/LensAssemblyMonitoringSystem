using LensAssemblyMonitoringWeb.Features.Models.Commands;
using LensAssemblyMonitoringWeb.Features.Models.Data;
using LensAssemblyMonitoringWeb.Features.Models.Services;
using LensAssemblyMonitoringWeb.Shared.Commands;

namespace LensAssemblyMonitoringWeb.Features.Models
{
    public static class ModelFeatureRegistration
    {
        public static IServiceCollection AddModelFeature(this IServiceCollection services)
        {
            services.AddScoped<IModelRepository, ModelRepository>();
            services.AddScoped<ICommandHandler<SyncModelsCommand, SyncModelsResult>, SyncModelsHandler>();
            services.AddSingleton<IModelStorageService, FileSystemModelStorageService>();
            services.AddSingleton<IModelValidationService, ModelValidationService>();

            return services;
        }
    }
}
