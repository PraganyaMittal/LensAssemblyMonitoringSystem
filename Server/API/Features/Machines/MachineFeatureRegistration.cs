using LensAssemblyMonitoringWeb.Features.Machines.Data;

namespace LensAssemblyMonitoringWeb.Features.Machines
{
    public static class MachineFeatureRegistration
    {
        public static IServiceCollection AddMachineFeature(this IServiceCollection services)
        {
            services.AddScoped<ILensAssemblyMCRepository, LensAssemblyMCRepository>();
            return services;
        }
    }
}
