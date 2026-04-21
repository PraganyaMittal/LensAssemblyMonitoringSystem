#pragma once

#include <string>

namespace AutoUpdater {

	/// <summary>
	/// Core abstraction for the Strategy pattern.
	/// 
	/// Each deployment type (Bundle, LAI) implements this interface to provide
	/// type-specific behavior for each step of the deployment algorithm.
	/// The DeploymentOrchestrator calls these methods in a fixed sequence
	/// (Template Method pattern), ensuring the algorithm skeleton is invariant
	/// while allowing each strategy to provide its own implementation.
	/// 
	/// Design contract:
	///   - Each method returns true on success, false on failure
	///   - Cleanup() is ALWAYS called (even on failure) — pass success flag
	///   - Strategies must be self-contained: no shared mutable state between steps
	///   - Strategies must NOT handle AutoUpdater.exe — the Service manages it exclusively
	/// 
	/// SOLID compliance:
	///   - SRP: Each strategy handles exactly ONE deployment type
	///   - OCP: New types = new strategy file, no existing code modified
	///   - LSP: Any IDeploymentStrategy works interchangeably in the orchestrator
	///   - DIP: Orchestrator depends on this abstraction, not concrete classes
	/// </summary>
	class IDeploymentStrategy {
	public:
		virtual ~IDeploymentStrategy() = default;

		// ── Lifecycle Steps (called in order by DeploymentOrchestrator) ──

		/// <summary>
		/// Stop all processes that own files being replaced.
		/// Bundle: Agent + Service.  LAI: LAI process only.
		/// Must be idempotent — safe to call if processes are already stopped.
		/// </summary>
		virtual bool StopProcesses() = 0;

		/// <summary>
		/// Create a backup of the current installation.
		/// For updates: backs up entire target directory + writes backup_manifest.json.
		/// For rollbacks: returns true (no-op — backup already exists from original update).
		/// </summary>
		virtual bool CreateBackup() = 0;

		/// <summary>
		/// Replace target files from the source directory using AtomicFileReplacer.
		/// Guarantees all-or-nothing semantics via .old file markers.
		/// Must respect the exclusion list (e.g., AutoUpdater.exe for Bundle).
		/// </summary>
		virtual bool ReplaceFiles() = 0;

		/// <summary>
		/// Restart all processes that were stopped in StopProcesses().
		/// Must start processes in the correct order and verify they launched.
		/// </summary>
		virtual bool RestartProcesses() = 0;

		/// <summary>
		/// Verify that restarted processes are healthy and operational.
		/// Bundle: Service is RUNNING (SCM) + Agent process exists.
		/// LAI: LAI process exists.
		/// Uses polling with timeout.
		/// </summary>
		virtual bool VerifyHealth() = 0;

		/// <summary>
		/// Final cleanup after deployment completes.
		/// Called with success=true on successful deployment, success=false on failure.
		/// 
		/// On success:
		///   - Update: clean staging directory, remove .update_in_progress marker
		///   - Rollback: clean staging directory + backup directory (no rollback-of-rollback)
		/// 
		/// On failure:
		///   - Attempt to restore from backup (if backup exists)
		///   - Clean up any .old marker files left by AtomicFileReplacer
		///   - Leave backup intact for retry
		/// </summary>
		virtual void Cleanup(bool success) = 0;

		// ── Metadata ──

		/// <summary>
		/// Human-readable type name for logging (e.g., "Bundle", "LAI").
		/// </summary>
		virtual std::string GetTypeName() const = 0;

		/// <summary>
		/// Whether this deployment is a rollback operation.
		/// </summary>
		virtual bool IsRollback() const = 0;
	};

} // namespace AutoUpdater
