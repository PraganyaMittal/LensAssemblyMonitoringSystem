using LensAssemblyMonitoringWeb.Models.DTOs;

namespace LensAssemblyMonitoringWeb.Commands.Agent
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
