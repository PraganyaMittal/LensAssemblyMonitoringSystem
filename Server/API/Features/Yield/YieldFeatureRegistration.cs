using LensAssemblyMonitoringWeb.Features.Yield.Data;
using LensAssemblyMonitoringWeb.Features.Yield.Services;

namespace LensAssemblyMonitoringWeb.Features.Yield
{
    public static class YieldFeatureRegistration
    {
        public static IServiceCollection AddYieldFeature(this IServiceCollection services)
        {
            services.AddSingleton<IYieldAlertService, YieldAlertService>();
            services.AddScoped<IYieldRepository, YieldRepository>();

            return services;
        }
    }
}
