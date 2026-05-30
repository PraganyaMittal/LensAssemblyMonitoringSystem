using LensAssemblyMonitoringWeb.Features.Updates.Commands;
using LensAssemblyMonitoringWeb.Features.Updates.Services;
using LensAssemblyMonitoringWeb.Shared.Commands;

namespace LensAssemblyMonitoringWeb.Features.Updates
{
    public static class UpdateFeatureRegistration
    {
        public static IServiceCollection AddUpdateFeature(this IServiceCollection services)
        {
            services.AddScoped<ICommandHandler<CreateScheduleCommand, CreateScheduleResult>, CreateScheduleHandler>();
            services.AddScoped<ICommandHandler<CancelScheduleCommand, CancelScheduleResult>, CancelScheduleHandler>();
            services.AddScoped<ICommandHandler<RollbackScheduleCommand, RollbackScheduleResult>, RollbackScheduleHandler>();

            services.AddHostedService<LineDeploymentOrchestratorService>();
            services.AddScoped<ILAIService, LAIService>();
            services.AddScoped<IBundleService, BundleService>();
            services.AddSingleton<ICredentialEncryptionService, CredentialEncryptionService>();
            services.AddHostedService<PackageCleanupService>();

            return services;
        }
    }
}
