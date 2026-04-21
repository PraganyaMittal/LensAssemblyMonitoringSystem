#pragma once

#include "IDeploymentStrategy.h"
#include "DeploymentContext.h"

namespace AutoUpdater {

	/// <summary>
	/// Strategy for LAI (Lens Assembly Inspection) deployments.
	/// 
	/// LAI deployments are simpler than Bundle because:
	///   - Only the LAI process needs to be stopped (Agent + Service stay alive)
	///   - Full directory wipe-and-replace (LAI dir is self-contained)
	///   - No session management complexity (LAI runs in user session)
	///   - Agent stays alive and can detect .update_result on next heartbeat
	/// 
	/// Update mode:
	///   Stop LAI → Backup entire LAI\ → Wipe LAI\ → Replace from staging → Start LAI → Verify
	/// 
	/// Rollback mode:
	///   Stop LAI → Skip backup → Wipe LAI\ → Replace from staging (populated from backup) → Start LAI → Verify
	/// </summary>
	class LaiUpdateStrategy : public IDeploymentStrategy {
	public:
		explicit LaiUpdateStrategy(const DeploymentContext& context);

		bool StopProcesses() override;
		bool CreateBackup() override;
		bool ReplaceFiles() override;
		bool RestartProcesses() override;
		bool VerifyHealth() override;
		void Cleanup(bool success) override;

		std::string GetTypeName() const override { return "LAI"; }
		bool IsRollback() const override { return context_.isRollback; }

	private:
		DeploymentContext context_;
	};

} // namespace AutoUpdater
