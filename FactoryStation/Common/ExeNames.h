#pragma once

// ExeNames — Single Source of Truth for executable names.
// Values are injected by MSBuild via <PreprocessorDefinitions>.
// Fallback defaults below ensure standalone compilation still works.

#ifndef EXE_NAME_AGENT
#define EXE_NAME_AGENT       "LensAssemblyAgent.exe"
#endif
#ifndef EXE_NAME_SERVICE
#define EXE_NAME_SERVICE     "LensAssemblyService.exe"
#endif
#ifndef EXE_NAME_UPDATER
#define EXE_NAME_UPDATER     "LensAssemblyAutoUpdater.exe"
#endif
#ifndef EXE_NAME_LAI
#define EXE_NAME_LAI         "LensAssy.exe"
#endif
#ifndef SERVICE_SCM_NAME
#define SERVICE_SCM_NAME     "LensAssemblyService"
#endif

// Wide-string versions (auto-generated from narrow defines)
#define EXE_NAME_AGENT_W     L"" EXE_NAME_AGENT
#define EXE_NAME_SERVICE_W   L"" EXE_NAME_SERVICE
#define EXE_NAME_UPDATER_W   L"" EXE_NAME_UPDATER
#define EXE_NAME_LAI_W       L"" EXE_NAME_LAI
#define SERVICE_SCM_NAME_W   L"" SERVICE_SCM_NAME

// Global Named Event — Agent listens; AutoUpdater, ServiceSetup, and Uninstaller trigger
#define GLOBAL_AGENT_STOP_EVENT    L"Global\\LensAssemblyAgent_GracefulStop"

// Global Mutex — AutoUpdater holds while running; Watchdog checks before restarting Agent
#define GLOBAL_UPDATE_MUTEX        L"Global\\LensAssembly_UpdateActive"
