using LensAssemblyMonitoringWeb.Features.Logs.Batching;
using LensAssemblyMonitoringWeb.Features.Logs.Configuration;
using LensAssemblyMonitoringWeb.Features.Logs.Services;

namespace LensAssemblyMonitoringWeb.Features.Logs
{
    public static class LogFeatureRegistration
    {
        public static IServiceCollection AddLogFeature(this IServiceCollection services, IConfiguration configuration)
        {
            services.Configure<LogSettings>(configuration.GetSection(LogSettings.SectionName));

            services.AddSingleton<ILogCache>(sp =>
            {
                var logger = sp.GetRequiredService<ILogger<LruSizeBasedLogCache>>();
                var settings = configuration.GetSection(LogSettings.SectionName).Get<LogSettings>() ?? new LogSettings();
                return new LruSizeBasedLogCache(logger, settings.CacheSizeLimitBytes);
            });

            services.AddSingleton<ILogService, LogService>();
            services.AddSingleton<IImageService, ImageService>();
            services.AddSingleton<IThumbnailCache, ThumbnailCache>();
            services.AddSingleton<IFullImageCache, FullImageCache>();
            services.AddSingleton<LogStructureQueue>();
            services.AddHostedService<LogStructureBatchProcessor>();

            return services;
        }
    }
}
