#pragma once

#include "IDeploymentStrategy.h"
#include "DeploymentContext.h"
#include "UpdateConfig.h"
#include <memory>

namespace AutoUpdater {

	/// <summary>
	/// Template Method pattern — owns the invariant deployment algorithm.
	/// 
	/// The orchestrator defines the FIXED execution sequence:
	///   INIT → STOP_PROCESSES → BACKUP → REPLACE_FILES → RESTART → VERIFY → CLEANUP → DONE
	/// 
	/// Each step delegates to the injected IDeploymentStrategy, which provides
	/// type-specific (Bundle/LAI) and mode-specific (update/rollback) implementations.
	/// 
	/// The orchestrator handles:
	///   - State machine transitions with logging
	///   - Error detection and failure handling at each step
	///   - Crash recovery via manifest detection
	///   - Exit code determination
	/// 
	/// The orchestrator does NOT handle:
	///   - Type-specific process management (that's the strategy's job)
	///   - File replacement logic (that's AtomicFileReplacer's job)
	///   - AutoUpdater.exe management (that's the Service's job)
	/// </summary>
	class DeploymentOrchestrator {
	public:
		/// <param name="strategy">Concrete deployment strategy (ownership transferred)</param>
		/// <param name="context">Immutable deployment configuration</param>
		DeploymentOrchestrator(std::unique_ptr<IDeploymentStrategy> strategy,
			const DeploymentContext& context);

		/// <summary>
		/// Execute the deployment pipeline.
		/// Returns an exit code from UpdateConfig (EXIT_SUCCESS_CODE, EXIT_STOP_FAILED, etc.)
		/// </summary>
		int Execute();

	private:
		std::unique_ptr<IDeploymentStrategy> strategy_;
		DeploymentContext context_;
		UpdateConfig::UpdateState currentState_;

		/// <summary>
		/// Transition to the next state with logging.
		/// </summary>
		void TransitionTo(UpdateConfig::UpdateState newState);

		/// <summary>
		/// Log a message with current state context and timestamp.
		/// </summary>
		void Log(const char* message) const;
		void LogError(const char* message) const;

		/// <summary>
		/// Map the failed state to an appropriate exit code.
		/// </summary>
		int GetExitCodeForFailure(UpdateConfig::UpdateState failedState) const;
	};

} // namespace AutoUpdater
