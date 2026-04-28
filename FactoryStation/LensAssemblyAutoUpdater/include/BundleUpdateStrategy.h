#pragma once

#include "IDeploymentStrategy.h"
#include "DeploymentContext.h"

namespace AutoUpdater {

	/// <summary>
	/// Strategy for Bundle deployments (Agent + Service + AutoUpdater).
	/// 
	/// Bundle deployments are the most complex type because they involve:
	///   - Stopping/starting multiple interdependent processes (Agent, Service)
	///   - The AutoUpdater itself is part of the Bundle but is excluded from replacement
	///   - The Service manages AutoUpdater.exe separately (update/downgrade)
	///   - Processes run in different sessions (Service in Session 0, Agent in user session)
	/// 
	/// Update mode:
	///   Stop Agent+Service → Backup entire Bundle\ → Replace files → Start Service+Agent → Verify
	/// 
	/// Rollback mode:
	///   Stop Agent+Service → Skip backup → Replace files from staging (populated from backup by Service) → Start Service+Agent → Verify
	/// </summary>
	class BundleUpdateStrategy : public IDeploymentStrategy {
	public:
		explicit BundleUpdateStrategy(const DeploymentContext& context);

		bool StopProcesses() override;
		bool CreateBackup() override;
		bool ReplaceFiles() override;
		bool RestartProcesses() override;
		bool VerifyHealth() override;
		void Cleanup(bool success) override;

		std::string GetTypeName() const override { return "Bundle"; }
		bool IsRollback() const override { return context_.isRollback; }

	private:
		DeploymentContext context_;
	};

} // namespace AutoUpdater
