#include "pch.h"
#include "PipeHandler.h"
#include "PipeProtocol.h"
#include "ServiceLogger.h"
#include <sddl.h>

PipeHandler::~PipeHandler() {
	Cleanup();
}

bool PipeHandler::CreatePipe() {
	SECURITY_ATTRIBUTES sa;
	sa.nLength = sizeof(sa);
	sa.bInheritHandle = FALSE;
	ConvertStringSecurityDescriptorToSecurityDescriptorW(L"D:(A;;GA;;;SY)(A;;GRGW;;;BU)", SDDL_REVISION_1, &sa.lpSecurityDescriptor, NULL);

	hPipe_ = CreateNamedPipeW(
		PipeProtocol::PIPE_NAME,
		PIPE_ACCESS_DUPLEX,
		PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT,
		1,
		PipeProtocol::BUFFER_SIZE,
		PipeProtocol::BUFFER_SIZE,
		0,
		&sa
	);

	if (sa.lpSecurityDescriptor) {
		LocalFree(sa.lpSecurityDescriptor);
	}

	if (hPipe_ == INVALID_HANDLE_VALUE) {
		PIPE_LOG_ERROR("[PipeHandler] CreateNamedPipe failed. Error: " << GetLastError());
		return false;
	}

	PIPE_LOG_INFO("[PipeHandler] Pipe created.");
	return true;
}

int PipeHandler::WaitForClient() {
	if (clientConnected_) {
		FlushFileBuffers(hPipe_);
		clientConnected_ = false;
	}
	DisconnectNamedPipe(hPipe_);

	PIPE_LOG_INFO("[PipeHandler] Waiting for agent...");

	BOOL connected = ConnectNamedPipe(hPipe_, NULL);
	DWORD err = GetLastError();

	if (connected || err == ERROR_PIPE_CONNECTED) {
		clientConnected_ = true;
		return 0;
	}

	if (err == ERROR_OPERATION_ABORTED) {
		return 1; 
	}

	PIPE_LOG_ERROR("[PipeHandler] ConnectNamedPipe failed. Error: " << err);
	return -1;
}

std::string PipeHandler::ReadMessage() {
	if (!clientConnected_) return "";

	char buffer[PipeProtocol::BUFFER_SIZE];
	DWORD bytesRead = 0;

	BOOL success = ReadFile(hPipe_, buffer, sizeof(buffer) - 1, &bytesRead, NULL);

	if (success && bytesRead > 0) {
		buffer[bytesRead] = '\0';
		return std::string(buffer, bytesRead);
	}

	DWORD err = GetLastError();

	if (err == ERROR_OPERATION_ABORTED) {
		return "";
	}

	if (err == ERROR_BROKEN_PIPE || err == ERROR_NO_DATA) {
		PIPE_LOG_INFO("[PipeHandler] Client disconnected (broken pipe).");
	} else {
		PIPE_LOG_ERROR("[PipeHandler] ReadFile failed. Error: " << err);
	}

	DisconnectClient();
	return "";
}

std::string PipeHandler::ReadMessageWithTimeout(DWORD timeoutMs) {
	if (!clientConnected_) return "";

	char buffer[PipeProtocol::BUFFER_SIZE];
	DWORD bytesRead = 0;

	auto start = std::chrono::steady_clock::now();
	while (true) {
		DWORD bytesAvailable = 0;
		BOOL peekOk = PeekNamedPipe(hPipe_, NULL, 0, NULL, &bytesAvailable, NULL);

		if (!peekOk) {
			DWORD err = GetLastError();
			if (err == ERROR_BROKEN_PIPE || err == ERROR_PIPE_NOT_CONNECTED) {
				PIPE_LOG_INFO("[PipeHandler] Client disconnected (broken pipe).");
			} else {
				PIPE_LOG_ERROR("[PipeHandler] PeekNamedPipe failed. Error: " << err);
			}
			DisconnectClient();
			return "";
		}

		if (bytesAvailable > 0) {
			BOOL readOk = ReadFile(hPipe_, buffer, sizeof(buffer) - 1, &bytesRead, NULL);
			if (readOk && bytesRead > 0) {
				buffer[bytesRead] = '\0';
				return std::string(buffer, bytesRead);
			}
			DisconnectClient();
			return "";
		}

		auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
			std::chrono::steady_clock::now() - start).count();
		if (elapsed >= timeoutMs) {
			return "";
		}

		std::this_thread::sleep_for(std::chrono::milliseconds(50));
	}
}

bool PipeHandler::WriteMessage(const std::string& message) {
	if (!clientConnected_) return false;

	DWORD bytesWritten = 0;
	BOOL success = WriteFile(hPipe_, message.c_str(), (DWORD)message.size(), &bytesWritten, NULL);

	if (success) {
		FlushFileBuffers(hPipe_);
		return true;
	}

	DWORD err = GetLastError();

	if (err == ERROR_NO_DATA || err == ERROR_BROKEN_PIPE) {
		PIPE_LOG_ERROR("[PipeHandler] Client disconnected (broken pipe). Error: " << err);
		DisconnectClient();
		return false;
	}

	PIPE_LOG_ERROR("[PipeHandler] WriteFile failed. Error: " << err);
	return false;
}

void PipeHandler::DisconnectClient() {
	if (hPipe_ == INVALID_HANDLE_VALUE) return;

	if (clientConnected_) {
		FlushFileBuffers(hPipe_);
		DisconnectNamedPipe(hPipe_);
		clientConnected_ = false;
		PIPE_LOG_INFO("[PipeHandler] Client disconnected.");
	}
}

bool PipeHandler::IsClientConnected() const {
	return clientConnected_;
}

void PipeHandler::Cleanup() {
	if (clientConnected_) DisconnectClient();
	if (hPipe_ != INVALID_HANDLE_VALUE) { 
		CloseHandle(hPipe_); 
		hPipe_ = INVALID_HANDLE_VALUE; 
	}
}
