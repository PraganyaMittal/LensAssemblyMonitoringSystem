#pragma once

#include <windows.h>

class PipeHandler;
class ProcessManager;
class UpdateManager;

class UpdateOrchestrator {
public:
    static bool Execute(PipeHandler& pipe, ProcessManager& procMgr,
                        UpdateManager& updMgr, HANDLE stopEvent);
};
