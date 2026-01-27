/**
 * Chart Configuration Utility
 * 
 * Shared Plotly chart configurations for consistent styling.
 */
import { CHART_COLORS } from '../constants';

// Common layout settings
export const CHART_LAYOUT_BASE = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: {
        family: 'Inter, system-ui, sans-serif',
        color: '#94a3b8',
    },
    margin: { l: 60, r: 20, t: 20, b: 60 },
    autosize: true,
} as const;

// Common axis settings
export const AXIS_CONFIG = {
    gridcolor: '#1e293b',
    zerolinecolor: '#334155',
    linecolor: '#334155',
    tickcolor: '#475569',
    tickfont: { size: 11 },
} as const;

// Common config options
export const CHART_CONFIG = {
    displayModeBar: true,
    displaylogo: false,
    modeBarButtonsToRemove: [
        'select2d',
        'lasso2d',
        'autoScale2d',
        'hoverClosestCartesian',
        'hoverCompareCartesian',
    ] as const,
    responsive: true,
} as const;

/**
 * Get color by operation status.
 */
export function getOperationColor(isNG: boolean, isSelected: boolean): string {
    if (isNG) return CHART_COLORS.danger;
    if (isSelected) return CHART_COLORS.primary;
    return CHART_COLORS.secondary;
}

/**
 * Format duration in milliseconds to human-readable string.
 */
export function formatDuration(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
}

/**
 * Calculate responsive tick gap for x-axis.
 */
export function calculateTickGap(visibleStart: number, visibleEnd: number): number {
    const range = visibleEnd - visibleStart;
    if (range > 100000) return 20000;
    if (range > 50000) return 10000;
    if (range > 20000) return 5000;
    return 1000;
}
