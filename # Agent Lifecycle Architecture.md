# Agent Lifecycle Architecture

## Purpose

This document defines the production lifecycle for Factory Monitoring machines.

The final rule is:

```text
Decommission, not delete.
```

The UI may label the destructive action as `Delete`, but the system must treat it as a full online decommission of the installed monitoring bundle: service, agent, autoupdater, runtime identity, local config, update state, and bundle/update/backup artifacts. `LAI` and `logs` are preserved. A machine deleted this way cannot reconnect until an operator manually runs `service setup.exe` and completes registration again.

## Final UI Contract

The machine identity UI is read-only.

- Show `View Machine Details`, not `Edit Machine Details`.
- Do not expose normal dashboard editing for line number, MC number, IP address, generation, or local paths.
- Show `Delete` immediately to the right of `View Machine Details`.
- Enable `Delete` only when the agent is online.
- Disable `Delete` when the agent is offline, with a message that the agent must be online to uninstall safely.

The delete confirmation must explain:

- The action will stop and uninstall the service, agent, and autoupdater.
- Local Bundle/config/crashes/update/backup files and update marker files will be removed.
- `LAI` and `logs` will be preserved for production continuity and audit/debug.
- Reuse requires manual service setup and fresh registration.

## Lifecycle States

Use explicit server lifecycle state on `LensAssemblyMCs`.

- `Active`
- `PendingDecommission`
- `DecommissionFailed`
- `Decommissioned`

Recommended fields:

- `LifecycleState`
- `LifecycleRequestedAtUtc`
- `LifecycleCompletedAtUtc`
- `LifecycleCommandId`
- `LifecycleError`

Normal dashboard queries must hide `PendingDecommission` and `Decommissioned` rows, but the rows should remain in the database for audit/history. `DecommissionFailed` rows stay visible so an operator can see the reason and retry after the agent is online. Unique active assignment checks should ignore decommissioned rows so the same line/MC/IP can be registered again after manual setup.

## Delete Means Decommission

### Online Agent

1. User clicks `Delete`.
2. Server re-checks that the agent is online.
3. Server cancels pending model/config/deployment commands for the MC.
4. Server marks the MC as `PendingDecommission`.
5. Server queues `DecommissionAgent`.
6. Agent reports `InProgress`.
7. Agent sends `DECOMMISSION_REQUEST` to the Windows service over the existing named pipe.
8. Service copies the installed `Bundle\ServiceSetup.exe` to `%ProgramData%\LensAssemblyMonitoring\Decommission\ServiceSetup.exe`.
9. Service launches the temp setup worker as LocalSystem with `--uninstall --full-cleanup --remote-decommission --base-dir "<install-root>" --server-url "<server>" --command-id <id> --agent-pid <pid>`.
10. Setup stops/uninstalls the service, stops autoupdater, stops the agent, deletes runtime identity and monitoring folders, and preserves `LAI` and `logs`.
11. Setup worker posts final `Completed` or `Failed` to `/api/agent/commandresult`.
12. Server marks the MC `Decommissioned` only after `Completed`.
13. UI hides the machine from normal dashboard views as soon as delete is accepted.

### Offline Agent

Offline delete is blocked.

There is no normal pending delete and no admin force-hide override. This avoids a split-brain state where the server hides the record but the physical PC still has a valid installed bundle.

The operator must bring the agent online before deleting. If the PC is physically unavailable forever, handle that outside the normal UI workflow with a documented database/admin procedure.

## Registration After Delete

After a successful delete/decommission:

1. The installed monitoring bundle is gone or scheduled for cleanup.
2. The old `agent_config.json` is removed.
3. `LAI` and `logs` remain on disk.
4. The old server row remains as `Decommissioned` and is hidden from normal UI.
5. The operator must run `service setup.exe` manually.
6. Agent registration dialog collects machine details again.
7. Server creates a new active MC record or reuses only flows intentionally designed for fresh registration.

Registration must reject duplicate active assignments:

```text
LineNumber + MCNumber + ModelVersion
IPAddress
```

Decommissioned rows must not block fresh setup.

## Production Risks And Required Handling

### Hard Delete Before Cleanup

Risk: deleting the DB row first leaves no reliable command target and can orphan an installed agent.

Required handling: never hard-delete from the normal UI. Mark `PendingDecommission`, queue `DecommissionAgent`, and hide only after confirmed success.

### Agent Offline

Risk: an offline PC cannot uninstall itself.

Required handling: disable UI delete and reject direct API delete requests while offline.

### Agent Goes Offline During Delete

Risk: the command may be queued or started but cleanup may not finish.

Required handling: keep state as `PendingDecommission` until command result arrives. On failure, mark `DecommissionFailed` and show retry once the agent is online.

### Partial Uninstall

Risk: service removal, process stop, or file cleanup may fail because of permissions or files in use.

Required handling: setup uninstall must be idempotent, return a non-zero exit code on failure, and schedule in-use files for deletion on reboot where necessary.

### Result Lost After Cleanup

Risk: the agent may shut down before the server records the result.

Required handling: agent reports `InProgress` only. The service-owned setup worker performs cleanup and sends the final result directly to the server. Server should not mark `Decommissioned` unless it receives a successful worker result.

### UAC And Elevation

Risk: `ShellExecute(..., "runas")` may fail or require user approval.

Required handling: manual GUI setup/uninstall may require UAC because it installs/removes a Windows service. Web-based delete must not use `runas`; the already-elevated service launches the cleanup worker with `CreateProcessW`. Treat IPC failure, worker launch failure, or non-zero setup exit code as `DecommissionFailed`.

### Wrong Config Path

Risk: deleting `agent_config.json` relative to the setup executable misses the real runtime identity.

Required handling: setup accepts explicit `--base-dir`, falls back to resolving the install root from its own location, and deletes `config\agent_config.json`.

### Setup Run From External Path

Risk: the original setup may be launched from USB, a download folder, or a network share that is unavailable later when remote decommission is requested.

Required handling: install must copy a maintenance copy of `ServiceSetup.exe` into `Bundle`. That copy is intentional and is the stable local entry point for future remote decommission.

### Setup Deletes Itself

Risk: the cleanup executable may run from `Bundle` while the cleanup routine is deleting `Bundle`.

Required handling: when full cleanup would delete the running setup executable, setup must copy itself to `%ProgramData%\LensAssemblyMonitoring\Decommission\ServiceSetup.exe` and run the temp worker. GUI uninstall from installed `Bundle` launches the temp worker with `--wait-pid`; remote decommission is service-owned and launches the temp worker with explicit `--base-dir`, `--server-url`, `--command-id`, and `--agent-pid`.

### Pending Commands

Risk: model/config/deployment commands can race with decommission.

Required handling: cancel pending/in-progress commands and deployments before queuing `DecommissionAgent`.

### Unknown Old Agent Reconnects

Risk: an old orphaned agent may heartbeat with a missing or decommissioned MC id.

Required handling: server returns `ResetAgent` as an orphan safety net. Normal delete should not rely on this path.

## Implementation Notes

- `POST /api/MC/DeleteMC` should mean "request decommission" for compatibility with existing UI callers.
- `DeleteMC` must reject offline MCs.
- `DeleteMC` must not remove `LensAssemblyMCs`, `Models`, `AgentCommands`, logs, schedules, or deployments as part of the request.
- Normal dashboard/list APIs hide `PendingDecommission` and `Decommissioned`; failed decommissions remain visible.
- `DecommissionAgent` is the only normal destructive machine lifecycle command.
- `UpdateMC` and the edit-machine modal are not part of the normal UI and should be removed or kept out of production routing.
- `ResetAgent` remains only for orphan/missing-id safety and should not be the normal delete path.

## Setup And Cleanup Contract

Initial setup may run from any external path. During install, setup creates the LAMS directory tree and copies the service, agent, autoupdater, and `ServiceSetup.exe` into `Bundle`. Keeping `ServiceSetup.exe` in `Bundle` is correct because remote decommission needs a local maintenance executable after the original installer location is gone.

GUI uninstall, CLI uninstall, and remote decommission must use the same cleanup routine.

CLI contract:

```text
ServiceSetup.exe --uninstall --full-cleanup --base-dir "<install-root>" [--invoked-by-agent] [--wait-pid <pid>]
ServiceSetup.exe --uninstall --full-cleanup --remote-decommission --base-dir "<install-root>" --server-url "<server>" --command-id <id> --agent-pid <pid>
```

Cleanup removes:

- `Bundle`
- `config`
- `crashes`
- `update`
- `backup`
- `.update_command_id`
- `.update_result`

Cleanup preserves:

- `LAI`
- `logs`

Missing services and files are success cases. Locked files should be scheduled for reboot deletion. The routine returns non-zero only when stopping/unregistering or deleting/scheduling fails.

## Test Plan

- UI shows `View Machine Details` and no edit action.
- UI disables `Delete` when `isOnline = false`.
- Direct API delete while offline returns an error and does not queue commands.
- Online delete queues `DecommissionAgent`, not `ResetAgent`.
- Accepted delete hides the machine from the normal dashboard immediately.
- Pending model/config/deployment commands are cancelled before decommission.
- Agent reports `InProgress`, service launches cleanup without UAC, and setup worker reports `Completed` or `Failed`.
- Server marks `Decommissioned` only after successful command result.
- Dashboard hides `Decommissioned` rows.
- Fresh manual setup can register the same line/MC/IP after decommission.
- Install from an external path and verify `Bundle\ServiceSetup.exe` is copied.
- GUI uninstall from external setup path deletes monitoring folders and keeps `LAI`/`logs`.
- GUI uninstall from installed `Bundle\ServiceSetup.exe` uses the temp worker and deletes installed `Bundle`.
- Agent decommission sends `DECOMMISSION_REQUEST`; service launches temp setup with explicit `--base-dir`, `--server-url`, `--command-id`, and `--agent-pid`.
