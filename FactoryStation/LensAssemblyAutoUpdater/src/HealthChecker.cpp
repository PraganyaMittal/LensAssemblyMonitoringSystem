#include "pch.h"
#include "HealthChecker.h"
#include "ProcessController.h"
#include "UpdateConfig.h"
#include "UpdaterModules.h"
#include <LogEngine.h>
#include <future>

namespace fs = std::filesystem;

static constexpr const char* MOD = "HealthChecker";

bool HealthChecker::VerifyServiceRunning(const UpdateConfig::RuntimeConfig& runtime, DWORD timeoutMs) {
	LogEngine::Info(MOD, "Waiting for Service...");

	auto start = std::chrono::steady_clock::now();
	while (std::chrono::duration_cast<std::chrono::milliseconds>(
			   std::chrono::steady_clock::now() - start).count() < timeoutMs) {
		
		SC_HANDLE hSCM = OpenSCManagerW(NULL, NULL, SC_MANAGER_CONNECT);
		if (hSCM) {
			SC_HANDLE hService = OpenServiceW(hSCM, runtime.serviceName.c_str(), SERVICE_QUERY_STATUS);
			if (hService) {
				SERVICE_STATUS status = {};
				if (QueryServiceStatus(hService, &status) && status.dwCurrentState == SERVICE_RUNNING) {
					CloseServiceHandle(hService);
					CloseServiceHandle(hSCM);
					LogEngine::Info(MOD, "Service is running.");
					return true;
				}
				CloseServiceHandle(hService);
			}
			CloseServiceHandle(hSCM);
		}
		std::this_thread::sleep_for(std::chrono::milliseconds(UpdateConfig::HEALTH_CHECK_POLL_MS));
	}

	LogEngine::Error(MOD, "Service NOT running after timeout.");
	return false;
}

bool HealthChecker::VerifyAgentRunning(const UpdateConfig::RuntimeConfig& runtime, DWORD timeoutMs) {
	LogEngine::Info(MOD, "Waiting for Agent...");

	auto start = std::chrono::steady_clock::now();
	while (std::chrono::duration_cast<std::chrono::milliseconds>(
			   std::chrono::steady_clock::now() - start).count() < timeoutMs) {
		if (ProcessController::IsProcessRunning(runtime.agentExe.c_str())) {
			LogEngine::Info(MOD, "Agent is running.");
			return true;
		}
		std::this_thread::sleep_for(std::chrono::milliseconds(UpdateConfig::HEALTH_CHECK_POLL_MS));
	}

	LogEngine::Error(MOD, "Agent NOT running after timeout.");
	return false;
}

bool HealthChecker::VerifyLAIRunning(const UpdateConfig::Paths& paths, const UpdateConfig::RuntimeConfig& runtime, DWORD timeoutMs) {
	
	std::wstring laiPath = paths.LAI_DIR + runtime.laiExe.c_str();
	if (!fs::exists(laiPath)) {
		LogEngine::Info(MOD, "LAI exe not deployed. Skipping verification.");
		return true;
	}

	LogEngine::Info(MOD, "Waiting for LAI...");

	auto start = std::chrono::steady_clock::now();
	while (std::chrono::duration_cast<std::chrono::milliseconds>(
			   std::chrono::steady_clock::now() - start).count() < timeoutMs) {
		if (ProcessController::IsProcessRunning(runtime.laiExe.c_str())) {
			LogEngine::Info(MOD, "LAI is running.");
			return true;
		}
		std::this_thread::sleep_for(std::chrono::milliseconds(UpdateConfig::HEALTH_CHECK_POLL_MS));
	}

	LogEngine::Error(MOD, "LAI NOT running after timeout.");
	return false;
}

bool HealthChecker::VerifyBundle(const UpdateConfig::Paths& paths, const UpdateConfig::RuntimeConfig& runtime) {
	auto futureService = std::async(std::launch::async, VerifyServiceRunning, std::cref(runtime), UpdateConfig::HEALTH_CHECK_TIMEOUT_MS);
	auto futureAgent = std::async(std::launch::async, VerifyAgentRunning, std::cref(runtime), UpdateConfig::HEALTH_CHECK_TIMEOUT_MS);

	bool serviceOk = futureService.get();
	bool agentOk = futureAgent.get();

	if (serviceOk && agentOk) {
		LogEngine::Info(MOD, "Bundle components verified successfully.");
		return true;
	}

	LogEngine::Error(MOD, "Bundle verification FAILED. Service="
		+ std::to_string(serviceOk) + " Agent=" + std::to_string(agentOk));
	return false;
}

bool HealthChecker::VerifyLAI(const UpdateConfig::Paths& paths, const UpdateConfig::RuntimeConfig& runtime) {
	return VerifyLAIRunning(paths, runtime, UpdateConfig::HEALTH_CHECK_TIMEOUT_MS);
}
