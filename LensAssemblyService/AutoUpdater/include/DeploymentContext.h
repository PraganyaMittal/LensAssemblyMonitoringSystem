#pragma once

#include "UpdateConfig.h"
#include <string>
#include <vector>

namespace AutoUpdater {

	/// <summary>
	/// Immutable context carrying all configuration needed by the deployment pipeline.
	/// Created once from command-line arguments and passed through the entire execution.
	/// Replaces scattered global state with explicit, testable dependency injection.
	/// </summary>
	struct DeploymentContext {
		UpdateConfig::Paths paths;
		UpdateConfig::RuntimeConfig runtime;
		UpdateConfig::UpdateType type;
		bool isRollback;
		bool isRecovery;		// --recover flag: crash recovery mode (stale manifest found)

		/// <summary>
		/// Returns the source directory for file replacement.
		/// For both updates and rollbacks, this is the staging directory (update\Bundle\ or update\LAI\).
		/// The Service is responsible for populating staging from the correct source:
		///   - Update: downloads package → staging
		///   - Rollback: copies backup → staging
		/// </summary>
		std::wstring GetSourceDir() const {
			std::wstring subdir = (type == UpdateConfig::UpdateType::BUNDLE)
				? UpdateConfig::BUNDLE_SUBDIR
				: UpdateConfig::LAI_SUBDIR;
			return paths.UPDATE_DIR + subdir;
		}

		/// <summary>
		/// Returns the target directory where files will be installed.
		/// </summary>
		std::wstring GetTargetDir() const {
			return (type == UpdateConfig::UpdateType::BUNDLE)
				? paths.BUNDLE_DIR
				: paths.LAI_DIR;
		}

		/// <summary>
		/// Returns the backup directory for this deployment type.
		/// </summary>
		std::wstring GetBackupDir() const {
			return (type == UpdateConfig::UpdateType::BUNDLE)
				? paths.BACKUP_BUNDLE_DIR
				: paths.BACKUP_LAI_DIR;
		}

		/// <summary>
		/// Returns the operation type as a human-readable string for logging and result reporting.
		/// </summary>
		std::string GetOperationName() const {
			std::string typeName = (type == UpdateConfig::UpdateType::BUNDLE) ? "Bundle" : "LAI";
			std::string opName = isRollback ? "ROLLBACK" : "UPDATE";
			if (isRecovery) opName = "RECOVERY";
			return opName + " (" + typeName + ")";
		}

		/// <summary>
		/// Returns the operation type tag for .update_result file.
		/// Format: UPDATE, ROLLBACK, or RECOVERY.
		/// </summary>
		std::string GetResultOperationType() const {
			if (isRecovery) return "RECOVERY";
			return isRollback ? "ROLLBACK" : "UPDATE";
		}

		/// <summary>
		/// Returns the list of filenames that must be excluded from atomic file replacement.
		/// For Bundle deployments, AutoUpdater.exe is always excluded (it's managed by the Service).
		/// </summary>
		std::vector<std::wstring> GetReplacementExclusions() const {
			std::vector<std::wstring> exclusions;
			if (type == UpdateConfig::UpdateType::BUNDLE) {
				exclusions.push_back(runtime.updaterExe);
			}
			return exclusions;
		}
	};

} // namespace AutoUpdater
