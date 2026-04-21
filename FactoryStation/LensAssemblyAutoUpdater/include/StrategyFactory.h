#pragma once

#include "IDeploymentStrategy.h"
#include "DeploymentContext.h"
#include <memory>

namespace AutoUpdater {

	/// <summary>
	/// Factory for creating the correct deployment strategy based on context.
	/// 
	/// Single point of strategy creation — isolates the "which concrete class?"
	/// decision from the rest of the application. Adding a new deployment type
	/// requires only:
	///   1. Create NewTypeStrategy.h/.cpp implementing IDeploymentStrategy
	///   2. Add a case to StrategyFactory::Create()
	/// No other code changes needed (Open/Closed Principle).
	/// </summary>
	class StrategyFactory {
	public:
		/// <summary>
		/// Create the appropriate deployment strategy for the given context.
		/// </summary>
		/// <param name="context">Deployment configuration (type, isRollback, paths, etc.)</param>
		/// <returns>Unique pointer to the strategy, or nullptr if type is unknown</returns>
		static std::unique_ptr<IDeploymentStrategy> Create(const DeploymentContext& context);
	};

} // namespace AutoUpdater
