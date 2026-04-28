#pragma once

#include <string>
#include <vector>

namespace AutoUpdater {

	/// <summary>
	/// Provides atomic (all-or-nothing) file replacement for deployment operations.
	/// 
	/// Uses a two-phase approach inspired by database WAL (Write-Ahead Log):
	///   Phase 1 (Prepare): Rename each target file to .old (NTFS rename is atomic per-file)
	///   Phase 2 (Commit):  Copy each source file to target location
	///   If Phase 2 fails:  Rollback all .old renames to restore original state
	///   If Phase 2 succeeds: Delete all .old files (cleanup)
	/// 
	/// This guarantees:
	///   - No partially-updated installations
	///   - Machine is always in a consistent state (either fully old or fully new)
	///   - Failed replacements self-heal to the pre-operation state
	/// 
	/// The manifest file (.update_manifest) provides crash recovery:
	///   - Written before Phase 1 begins (lists all planned operations)
	///   - Deleted after successful cleanup
	///   - If found on startup, indicates a crashed operation → recovery needed
	/// 
	/// Thread safety: NOT thread-safe. Only one replacement operation should run at a time.
	/// </summary>
	class AtomicFileReplacer {
	public:
		/// <summary>
		/// Represents a single file operation within the atomic replacement batch.
		/// </summary>
		struct FileOperation {
			std::wstring sourceFile;		// Full path to source file (staging)
			std::wstring targetFile;		// Full path to destination file (install dir)
			std::wstring backupFile;		// Full path to .old backup (targetFile + L".old")
			bool renamed = false;			// Phase 1 completed (original renamed to .old)
			bool copied = false;			// Phase 2 completed (source copied to target)
		};

		/// <summary>
		/// Result of an atomic replacement operation.
		/// </summary>
		struct ReplaceResult {
			bool success = false;
			int totalFiles = 0;
			int replacedFiles = 0;
			std::string errorMessage;
		};

		/// <summary>
		/// Atomically replace all files from sourceDir into targetDir.
		/// 
		/// Algorithm:
		///   1. Enumerate sourceDir (recursive for subdirectories)
		///   2. Filter out any filenames in the exclusions list (case-insensitive)
		///   3. Write manifest file listing all planned operations
		///   4. Phase 1: For each file, rename target → target.old
		///   5. Phase 2: For each file, copy source → target (with retry)
		///   6. On success: delete all .old files, delete manifest
		///   7. On failure: rollback all renames, delete manifest
		/// </summary>
		/// <param name="sourceDir">Directory containing new files (staging)</param>
		/// <param name="targetDir">Directory to install into (Bundle\ or LAI\)</param>
		/// <param name="exclusions">Filenames to skip (case-insensitive, e.g., AutoUpdater.exe)</param>
		/// <param name="manifestPath">Path to write the operation manifest for crash recovery</param>
		/// <returns>Result indicating success/failure and details</returns>
		static ReplaceResult ReplaceAtomically(
			const std::wstring& sourceDir,
			const std::wstring& targetDir,
			const std::vector<std::wstring>& exclusions,
			const std::wstring& manifestPath);

		/// <summary>
		/// Recover from a crashed atomic replacement using a stale manifest file.
		/// 
		/// For each file listed in the manifest:
		///   - If .old exists and new file exists → delete .old (commit forward)
		///   - If .old exists and new file missing → rename .old back (rollback)
		///   - If neither exists → skip (file was never touched)
		/// 
		/// This ensures the machine reaches a consistent state after a crash.
		/// </summary>
		/// <param name="manifestPath">Path to the stale manifest file</param>
		/// <returns>true if recovery completed successfully</returns>
		static bool RecoverFromManifest(const std::wstring& manifestPath);

	private:
		/// <summary>
		/// Build the list of file operations by enumerating sourceDir.
		/// </summary>
		static std::vector<FileOperation> BuildOperationList(
			const std::wstring& sourceDir,
			const std::wstring& targetDir,
			const std::vector<std::wstring>& exclusions);

		/// <summary>
		/// Write the operation manifest to disk (WAL — must complete before any file changes).
		/// </summary>
		static bool WriteManifest(
			const std::wstring& manifestPath,
			const std::vector<FileOperation>& operations);

		/// <summary>
		/// Read a previously written manifest (used for crash recovery).
		/// </summary>
		static std::vector<FileOperation> ReadManifest(const std::wstring& manifestPath);

		/// <summary>
		/// Phase 1: Rename all target files to .old.
		/// Returns false and sets the index of the failed operation if any rename fails.
		/// </summary>
		static bool RenamePhase(std::vector<FileOperation>& operations, int& failedAt);

		/// <summary>
		/// Phase 2: Copy all source files to target locations with retry.
		/// Returns false and sets the index of the failed operation if any copy fails.
		/// </summary>
		static bool CopyPhase(std::vector<FileOperation>& operations, int& failedAt);

		/// <summary>
		/// Rollback all completed renames — restores .old files to their original names.
		/// Called when Phase 1 or Phase 2 fails.
		/// </summary>
		static void RollbackRenames(std::vector<FileOperation>& operations);

		/// <summary>
		/// Cleanup Phase: Delete all .old backup files after successful replacement.
		/// </summary>
		static void CleanupOldFiles(const std::vector<FileOperation>& operations);

		/// <summary>
		/// Check if a filename matches any entry in the exclusion list (case-insensitive).
		/// </summary>
		static bool IsExcluded(const std::wstring& filename, const std::vector<std::wstring>& exclusions);

		/// <summary>
		/// Copy a single file with retry logic.
		/// </summary>
		static bool CopyFileWithRetry(const std::wstring& src, const std::wstring& dst, int maxRetries);
	};

} // namespace AutoUpdater
