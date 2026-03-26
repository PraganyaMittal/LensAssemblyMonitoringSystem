using System.Collections.Generic;

namespace LensAssemblyMonitoringWeb.Models
{
    public class DashboardViewModel
    {
        public List<string> Versions { get; set; } = new List<string>();
        public string? SelectedVersion { get; set; }
        public string ViewMode { get; set; } = "cards"; 
        public List<LensAssemblyMC> MCs { get; set; } = new List<LensAssemblyMC>();
        public List<int> LineNumbers { get; set; } = new List<int>();
    }
}

