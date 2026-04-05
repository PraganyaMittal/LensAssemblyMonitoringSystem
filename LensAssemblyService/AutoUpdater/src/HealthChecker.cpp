#include "pch.h"
#include "HealthChecker.h"
#include "ProcessController.h"
#include "UpdateConfig.h"
#include <future>

namespace fs = std::filesystem;

bool HealthChecker::VerifyServiceRunning(DWORD timeoutMs) {
	std::cout << "[HealthCheck] Waiting for LensAssemblyService..." << std::endl;

	auto start = std::chrono::steady_clock::now();
	while (std::chrono::duration_cast<std::chrono::milliseconds>(
			   std::chrono::steady_clock::now() - start).count() < timeoutMs) {
		
		SC_HANDLE hSCM = OpenSCManagerW(NULL, NULL, SC_MANAGER_CONNECT);
		if (hSCM) {
			SC_HANDLE hService = OpenServiceW(hSCM, UpdateConfig::g_Runtime.serviceName.c_str(), SERVICE_QUERY_STATUS);
			if (hService) {
				SERVICE_STATUS status = {};
				if (QueryServiceStatus(hService, &status) && status.dwCurrentState == SERVICE_RUNNING) {
					CloseServiceHandle(hService);
					CloseServiceHandle(hSCM);
					std::cout << "[HealthCheck] LensAssemblyService is running." << std::endl;
					return true;
				}
				CloseServiceHandle(hService);
			}
			CloseServiceHandle(hSCM);
		}
		std::this_thread::sleep_for(std::chrono::milliseconds(UpdateConfig::HEALTH_CHECK_POLL_MS));
	}

	std::cerr << "[HealthCheck] LensAssemblyService NOT running after timeout." << std::endl;
	return false;
}

bool HealthChecker::VerifyAgentRunning(DWORD timeoutMs) {
	std::cout << "[HealthCheck] Waiting for Agent..." << std::endl;

	auto start = std::chrono::steady_clock::now();
	while (std::chrono::duration_cast<std::chrono::milliseconds>(
			   std::chrono::steady_clock::now() - start).count() < timeoutMs) {
		if (ProcessController::IsProcessRunning(UpdateConfig::g_Runtime.agentExe.c_str())) {
			std::cout << "[HealthCheck] Agent is running." << std::endl;
			return true;
		}
		std::this_thread::sleep_for(std::chrono::milliseconds(UpdateConfig::HEALTH_CHECK_POLL_MS));
	}

	std::cerr << "[HealthCheck] Agent NOT running after timeout." << std::endl;
	return false;
}

bool HealthChecker::VerifyLAIRunning(DWORD timeoutMs) {
	
	std::wstring laiPath = UpdateConfig::g_Paths.LAI_DIR + UpdateConfig::g_Runtime.laiExe.c_str();
	if (!fs::exists(laiPath)) {
		std::cout << "[HealthCheck] LAI.exe not deployed. Skipping verification." << std::endl;
		return true;
	}

	std::cout << "[HealthCheck] Waiting for LAI..." << std::endl;

	auto start = std::chrono::steady_clock::now();
	while (std::chrono::duration_cast<std::chrono::milliseconds>(
			   std::chrono::steady_clock::now() - start).count() < timeoutMs) {
		if (ProcessController::IsProcessRunning(UpdateConfig::g_Runtime.laiExe.c_str())) {
			std::cout << "[HealthCheck] LAI is running." << std::endl;
			return true;
		}
		std::this_thread::sleep_for(std::chrono::milliseconds(UpdateConfig::HEALTH_CHECK_POLL_MS));
	}

	std::cerr << "[HealthCheck] LAI NOT running after timeout." << std::endl;
	return false;
}

bool HealthChecker::VerifyAll() {
	auto futureService = std::async(std::launch::async, VerifyServiceRunning, UpdateConfig::HEALTH_CHECK_TIMEOUT_MS);
	auto futureAgent = std::async(std::launch::async, VerifyAgentRunning, UpdateConfig::HEALTH_CHECK_TIMEOUT_MS);
	auto futureLai = std::async(std::launch::async, VerifyLAIRunning, UpdateConfig::HEALTH_CHECK_TIMEOUT_MS);

	bool serviceOk = futureService.get();
	bool agentOk = futureAgent.get();
	bool laiOk = futureLai.get();

	if (serviceOk && agentOk && laiOk) {
		std::cout << "[HealthCheck] All components verified successfully." << std::endl;
		return true;
	}

	std::cerr << "[HealthCheck] Verification FAILED. Service=" << serviceOk << " Agent=" << agentOk << " LAI=" << laiOk << std::endl;
	return false;
}

