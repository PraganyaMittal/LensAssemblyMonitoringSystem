// LogAnalyzer Constants

// Operation name to inspection folder mapping
export const OPERATION_INSPECTION_MAP: Record<string, string> = {
    'Lens_Tray_Align': 'Lens Over',
    'Lens_Pickup': 'Lens Under1',
    'Lens_Align': 'Lens Under2',
    'Mask_Pickup': 'Mask Under',
    'Barrel_Align_Mask': 'Assy Tray Over1',
    'Barrel_Align_Lens': 'Assy Tray Over2',
};

// Polling intervals
export const LOG_STRUCTURE_POLL_INTERVAL_MS = 5000;

// Tooltip dimensions
export const TOOLTIP_WIDTH = 180;
export const TOOLTIP_HEIGHT = 150;
export const TOOLTIP_GAP = 12;
export const VIEWPORT_MARGIN = 10;

// Grace period for mouse bridge (ms)
export const GRACE_PERIOD_MS = 100;

// Chart colors
export const CHART_COLORS = {
    primary: '#60a5fa',
    secondary: '#34d399',
    warning: '#fbbf24',
    danger: '#f87171',
    muted: '#94a3b8',
    background: '#0f172a',
    surface: '#1e293b',
    border: '#334155',
} as const;

// File size display thresholds
export const FILE_SIZE_UNITS = ['B', 'KB', 'MB', 'GB'] as const;
