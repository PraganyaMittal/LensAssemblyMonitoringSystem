using LensAssemblyMonitoringWeb.Shared.Commands;
using LensAssemblyMonitoringWeb.Shared.Contracts;
using LensAssemblyMonitoringWeb.Features.Agents.Contracts;
using LensAssemblyMonitoringWeb.Features.Machines.Contracts;
using LensAssemblyMonitoringWeb.Features.Models.Contracts;
using LensAssemblyMonitoringWeb.Features.Updates.Contracts;
using LensAssemblyMonitoringWeb.Features.Logs.Contracts;
using LensAssemblyMonitoringWeb.Features.Yield.Contracts;

namespace LensAssemblyMonitoringWeb.Features.Agents.Commands
{
    public class UpdateModelCommand : ICommand<bool>
    {
        public UpdateModelRequest Request { get; }

        public UpdateModelCommand(UpdateModelRequest request)
        {
            Request = request ?? throw new ArgumentNullException(nameof(request));
        }
    }
}



