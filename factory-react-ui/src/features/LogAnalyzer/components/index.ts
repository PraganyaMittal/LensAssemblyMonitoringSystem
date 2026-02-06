/**
 * Components barrel export for Log Analyzer redesign
 */

// Error Boundary
export { LogAnalyzerErrorBoundary } from './ErrorBoundary/LogAnalyzerErrorBoundary';

// Log File Selector
export { LogFileSelector } from './LogFileSelector';

// Shared UI Primitives
export * from './shared';

// Redesigned components
export { Speedometer, type SpeedometerProps, type SpeedometerSegment } from './Speedometer';
export { LineBlock, type LineBlockProps } from './LineBlock';
export { SmartMachineCard, type SmartMachineCardProps, type MachineData } from './SmartMachineCard';
export { SettingsModal } from './SettingsModal';

// Advanced Speedometer (SVG/Canvas Hybrid)
export { AdvancedSpeedometer, type AdvancedSpeedometerProps } from './AdvancedSpeedometer';

// Machine Detail View Dashboard
export { MachineDetailView, type MachineDetailViewProps, type MachineStats } from './MachineDetailView';

// Unified Machine Card (compact with inline yield)
export { UnifiedMachineCard, type UnifiedMachineData, type UnifiedMachineCardProps } from './UnifiedMachineCard';
