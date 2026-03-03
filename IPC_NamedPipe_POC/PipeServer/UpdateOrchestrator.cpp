#include "UpdateOrchestrator.h"
#include "PipeHandler.h"
#include "ProcessManager.h"
#include "UpdateManager.h"
#include "../Common/PipeProtocol.h"
#include <iostream>
#include <thread>
#include <chrono>

bool UpdateOrchestrator::Execute(PipeHandler& pipe, ProcessManager& procMgr,
                                  UpdateManager& updMgr, HANDLE stopEvent) {
    using State = PipeProtocol::UpdateState;
    State state = State::UPDATE_DETECTED;

    auto log = [&](const char* msg) {
        std::cout << "[Update] [" << PipeProtocol::UpdateStateToString(state) << "] " << msg << std::endl;
    };

    log("Starting update process.");

    // Tell agent to stop (if connected)
    state = State::AGENT_STOPPING;
    if (pipe.IsClientConnected()) {
        pipe.WriteMessage(PipeProtocol::MakeMessage(PipeProtocol::CMD_UPDATE_NOW, "preparing"));

        // Wait for ACK_SHUTDOWN (agent may send other messages first)
        bool gotAck = false;
        for (int i = 0; i < 10; i++) {
            std::string msg = pipe.ReadMessage(stopEvent);
            if (msg.empty()) break;

            std::string cmd = PipeProtocol::ParseCommand(msg);
            if (cmd == PipeProtocol::CMD_ACK_SHUTDOWN) {
                log("Agent acknowledged shutdown.");
                gotAck = true;
                break;
            }
        }
        if (!gotAck) log("No ACK received. Proceeding anyway.");
    } else {
        log("No agent connected. Proceeding directly.");
    }

    // Wait for process to exit
    bool wasConnected = pipe.IsClientConnected();

    if (wasConnected) {
        // Agent was connected — give it time to exit gracefully (we sent UPDATE_NOW)
        if (!ProcessManager::WaitForProcessExitByName(PipeProtocol::AGENT_EXE_NAME, PipeProtocol::AGENT_EXIT_TIMEOUT_MS)) {
            log("Agent didn't exit. Force-killing.");
            ProcessManager::ForceKillProcessByName(PipeProtocol::AGENT_EXE_NAME);
            std::this_thread::sleep_for(std::chrono::seconds(1));
        }
    } else {
        // No pipe connection — kill any running instance immediately
        log("Force-killing any running agent process.");
        ProcessManager::ForceKillProcessByName(PipeProtocol::AGENT_EXE_NAME);
        std::this_thread::sleep_for(std::chrono::seconds(1));
    }

    // Verify it's gone
    if (!ProcessManager::WaitForProcessExitByName(PipeProtocol::AGENT_EXE_NAME, 3000)) {
        log("Cannot kill agent. Aborting update.");
        return false;
    }

    state = State::AGENT_STOPPED;
    log("Agent process exited.");

    pipe.DisconnectClient();

    // Replace binary
    state = State::FILES_REPLACING;
    if (!updMgr.PerformUpdate()) {
        state = State::FAILED;
        log("File replacement failed. Rolling back.");
        updMgr.Rollback();
        procMgr.ResetState();
        procMgr.StartAgentWithRetry(PipeProtocol::RESTART_MAX_RETRIES, PipeProtocol::RESTART_RETRY_DELAY_MS);
        return false;
    }

    // Restart agent
    state = State::AGENT_RESTARTING;
    procMgr.ResetState();
    std::this_thread::sleep_for(std::chrono::milliseconds(500));

    log("Starting new agent.");
    if (!procMgr.StartAgentWithRetry(PipeProtocol::RESTART_MAX_RETRIES, PipeProtocol::RESTART_RETRY_DELAY_MS)) {
        state = State::FAILED;
        log("New agent failed to start. Rolling back.");
        updMgr.Rollback();
        procMgr.ResetState();

        if (!procMgr.StartAgentWithRetry(PipeProtocol::RESTART_MAX_RETRIES, PipeProtocol::RESTART_RETRY_DELAY_MS)) {
            log("CRITICAL: Rollback agent also failed. Manual intervention needed.");
            return false;
        }
        return false;
    }

    state = State::IDLE;
    log("Update complete.");
    return true;
}
