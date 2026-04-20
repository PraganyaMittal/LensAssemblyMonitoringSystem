#pragma once

#include <string>

namespace AutoUpdater {

	/// <summary>
	/// Manages backup creation, validation, and manifest generation.
	/// 
	/// Backups are stored locally on each machine in a single backup\ directory.
	/// Each backup is the ENTIRE target directory (Bundle\ or LAI\), not individual files.
	/// 
	/// The backup manifest (backup_manifest.json) provides:
	///   - Validation data for the Agent to verify backup integrity before rollback
	///   - File inventory for debugging and auditing
	///   - Creation timestamp for tracking
	/// 
	/// Design decisions:
	///   - Single backup per type (overwritten on each update)
	///   - No backup_preserved — eliminated per architecture decision
	///   - Full directory backup — not selective files
	///   - Manifest is advisory — backup is valid even if manifest write fails
	/// </summary>
	class BackupManager {
	public:
		/// <summary>
		/// Backup an entire directory by copying it recursively to the backup location.
		/// If the backup directory already exists, it is REPLACED (overwritten).
		/// </summary>
		/// <param name="sourceDir">Directory to back up (e.g., Bundle\)</param>
		/// <param name="backupDir">Backup destination (e.g., backup\Bundle\)</param>
		/// <returns>true if backup completed successfully</returns>
		static bool BackupDirectory(const std::wstring& sourceDir, const std::wstring& backupDir);

		/// <summary>
		/// Write a backup manifest file (backup_manifest.json) in the backup directory.
		/// Lists all backed-up files for pre-rollback validation by the Agent.
		/// </summary>
		/// <param name="backupDir">Directory containing the backup</param>
		/// <param name="typeName">Type name for the manifest ("Bundle" or "LAI")</param>
		/// <returns>true if manifest was written successfully</returns>
		static bool WriteBackupManifest(const std::wstring& backupDir, const std::string& typeName);

	private:
		/// <summary>
		/// Ensure a directory exists, creating it and parents if necessary.
		/// </summary>
		static bool EnsureDirectory(const std::wstring& path);
	};

} // namespace AutoUpdater
