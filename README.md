Factory Monitoring System
A comprehensive full-stack solution designed to monitor factory line PCs, manage configuration files remotely, distribute machine learning models, and visualize operational logs using Gantt charts.

🏗 System Architecture
The system consists of four main components:

Factory Agent (C++): A lightweight Windows desktop agent installed on factory PCs to report status, manage local files, and execute remote commands.

Web API (ASP.NET Core): The central backend server that handles communication between agents, the database, and the frontend dashboard.

Dashboard (React + TypeScript): A modern web interface for operators and managers to view line status, upload models, and analyze logs.

Database (SQL Server): Central storage for PC states, configurations, models, and logs.

🚀 Key Features
Real-Time Monitoring: Track online/offline status, application heartbeat, and IP addresses of factory PCs.

Remote Configuration: View and update config.ini or JSON configuration files on remote PCs directly from the web dashboard.

Model Distribution: Upload machine learning models to the server and distribute them to specific lines, PC versions, or individual machines.

Log Analytics: Visualize system logs and cycle times using interactive Gantt charts (powered by Plotly).

Agent Discovery: Automatic registration of new PCs via the Agent's registration dialog.

System Commands: Send remote commands (e.g., restart application, update model) to factory agents.

🛠 Technology Stack
1. Factory Agent (Client)
Language: C++ (Visual Studio 2022 / MSVC)

Frameworks: Windows API (Win32), Winsock (Ws2_32.lib)

Dependencies: nlohmann/json (JSON parsing)

Features: System Tray integration, Socket communication, File I/O.

2. Web API (Backend)
Framework: ASP.NET Core (C#)

ORM: Entity Framework Core

Database: SQL Server

Communication: REST API

3. Frontend UI
Framework: React 18 (Vite)

Language: TypeScript

Styling: Tailwind CSS (implied by class names), Framer Motion (animations)

Charts: Plotly.js (via react-plotly.js)

Icons: Lucide React

📦 Getting Started
Prerequisites
Database: SQL Server (LocalDB or Enterprise)

Backend: .NET 6.0 SDK or later

Frontend: Node.js (v16+)

Agent: Visual Studio 2022 with C++ Desktop Development workload

Step 1: Database Setup
Open SQL Server Management Studio (SSMS).

Execute the scripts in the db/ folder in the following order:

01_CreateDatabase.sql

02_CreateTables.sql

03_CreateIndexes.sql

04_CreateStoredProcedures.sql

05_PopulateSampleData.sql (Optional)

Step 2: Backend Setup (LensAssemblyMonitoringWeb)
Navigate to LensAssemblyMonitoringWeb/.

Open appsettings.json and verify the DefaultConnection string points to your SQL Server instance.

JSON

"ConnectionStrings": {
  "DefaultConnection": "Server=(localdb)\\MSSQLLocalDB;Database=LensAssemblyMonitoringDB;..."
}
Run the application:

Bash

dotnet run
The API typically runs on http://localhost:5000 or https://localhost:7001.

Step 3: Frontend Setup (lens-assembly-react-ui)
Navigate to lens-assembly-react-ui/.

Install dependencies:

Bash

npm install
Start the development server:

Bash

npm run dev
Open your browser to the URL shown (usually http://localhost:5173).

Step 4: Agent Setup (LensAssemblyAgent)
Open LensAssemblyAgent/LensAssemblyAgent.sln in Visual Studio.

Ensure vcpkg or NuGet packages are restored if referenced (specifically nlohmann-json).

Build the solution (Debug or Release).

Run LensAssemblyAgent.exe.

First Run: A registration dialog will appear. Enter the Line Number, PC Number, and Server URL (e.g., http://localhost:5000).

Subsequent Runs: The agent runs in the system tray.

⚙️ Configuration
Agent Configuration (agent_config.json)
The agent generates a local JSON configuration file. You can also manually create it:

JSON

{
    "pcId": 1,
    "pcNumber": 1,
    "lineNumber": 1,
    "serverUrl": "http://localhost:5000",
    "exeName": "msedge.exe",
    "configFilePath": "C:\\LAI\\LAI-Operational\\config.ini",
    "logFolderPath": "C:\\LAI\\LAI-WorkData\\Log",
    "modelFolderPath": "C:\\LAI\\LAI-Operational\\Model"
}
exeName: The name of the process the agent should monitor (checks if running).

logFolderPath: The directory where the agent looks for logs to parse/upload.

modelFolderPath: The directory where models downloaded from the server will be placed.
