#pragma once

#include <string>
#include <vector>

struct AgentSettings {
	int mcId = 0;
	int lineNumber = 0;
	int mcNumber = 0;

	std::string configFilePath;
	std::string logFolderPath;
	std::string modelFolderPath;
	std::string generationNo = "3.5";
	std::string ipAddress;

	std::wstring serverUrl;
	std::wstring exeName;
	std::wstring yieldMonitorPath = L"C:\\LAI_Result_Current";
};

struct AgentStatus {
	bool isConnected = false;
	int mcId = 0;
	int lineNumber = 0;
	int connectionFailures = 0;
};

struct CommandResult {
	int commandId = 0;
	bool success = false;

	std::string status;
	std::string resultData;
	std::string errorMessage;
};

struct ModelInfo {
	bool isCurrent = false;

	std::string modelName;
	std::string modelPath;
};