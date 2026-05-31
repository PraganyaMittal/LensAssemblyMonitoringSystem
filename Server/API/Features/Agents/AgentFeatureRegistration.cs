using LensAssemblyMonitoringWeb.Features.Agents.Commands;
using LensAssemblyMonitoringWeb.Features.Agents.Data;
using LensAssemblyMonitoringWeb.Features.Agents.Services;
using LensAssemblyMonitoringWeb.Shared.Commands;

namespace LensAssemblyMonitoringWeb.Features.Agents
{
    public static class AgentFeatureRegistration
    {
        public static IServiceCollection AddAgentFeature(this IServiceCollection services)
        {
            services.AddHostedService<HeartbeatMonitorService>();
            services.AddHostedService<AgentCommandCleanupService>();

            services.AddScoped<IAgentCommandRepository, AgentCommandRepository>();
            services.AddScoped<IAgentRegistrationService, AgentRegistrationService>();
            services.AddScoped<IHeartbeatService, HeartbeatService>();
            services.AddSingleton<IConfigService, ConfigService>();
            services.AddScoped<ICommandDeliveryService, CommandDeliveryService>();

            services.AddScoped<ICommandHandler<RegisterAgentCommand, RegistrationResult>, RegisterAgentHandler>();
            services.AddScoped<ICommandHandler<HeartbeatCommand, HeartbeatResult>, HeartbeatHandler>();
            services.AddScoped<ICommandHandler<UpdateModelCommand, bool>, UpdateModelHandler>();
            services.AddScoped<ICommandHandler<CommandResultCommand, CommandResultResponse>, CommandResultHandler>();

            return services;
        }
    }
}
