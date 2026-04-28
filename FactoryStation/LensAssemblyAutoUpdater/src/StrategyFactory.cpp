#include "pch.h"
#include "StrategyFactory.h"
#include "BundleUpdateStrategy.h"
#include "LaiUpdateStrategy.h"

using namespace AutoUpdater;

std::unique_ptr<IDeploymentStrategy> StrategyFactory::Create(const DeploymentContext& context) {
	switch (context.type) {
		case UpdateConfig::UpdateType::BUNDLE:
			return std::make_unique<BundleUpdateStrategy>(context);

		case UpdateConfig::UpdateType::LAI:
			return std::make_unique<LaiUpdateStrategy>(context);

		default:
			std::cerr << "[StrategyFactory] Unknown deployment type." << std::endl;
			return nullptr;
	}
}
