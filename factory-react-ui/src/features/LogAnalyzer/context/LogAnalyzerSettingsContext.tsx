/**
 * LogAnalyzerSettingsContext
 *
 * Global settings for the Log Analyzer module.
 * Stores speedometer threshold configuration and date range, persists to localStorage.
 */
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { SpeedometerSegment } from '../components/Speedometer';

// =============================================================================
// TYPES
// =============================================================================

export type DateRangeMode = 'today' | 'last1' | 'last7' | 'last30' | 'custom';

export interface DateRangeSettings {
    mode: DateRangeMode;
    customFrom?: string;  // ISO date string YYYY-MM-DD
    customTo?: string;    // ISO date string YYYY-MM-DD
}

export interface LogAnalyzerSettings {
    /** Threshold below which yield is considered RED (danger) */
    redThreshold: number;
    /** Threshold below which yield is considered YELLOW (warning) */
    yellowThreshold: number;
    /** Date range for yield history */
    dateRange: DateRangeSettings;
    /** Whether yield mode is enabled (shows speedometers) */
    yieldModeEnabled: boolean;
}

export interface LogAnalyzerSettingsContextValue {
    settings: LogAnalyzerSettings;
    updateSettings: (newSettings: Partial<LogAnalyzerSettings>) => void;
    getSegments: () => SpeedometerSegment[];
    getDateRange: () => { from: Date; to: Date };
}

// =============================================================================
// DEFAULTS
// =============================================================================

const DEFAULT_SETTINGS: LogAnalyzerSettings = {
    redThreshold: 85,
    yellowThreshold: 95,
    dateRange: {
        mode: 'today',
    },
    yieldModeEnabled: true, // Show yield by default
};

const STORAGE_KEY = 'log-analyzer-settings';

// =============================================================================
// CONTEXT
// =============================================================================

const LogAnalyzerSettingsContext = createContext<LogAnalyzerSettingsContextValue | null>(null);

// =============================================================================
// PROVIDER
// =============================================================================

export const LogAnalyzerSettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [settings, setSettings] = useState<LogAnalyzerSettings>(() => {
        // Load from localStorage on init
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
            }
        } catch {
            // Ignore parse errors
        }
        return DEFAULT_SETTINGS;
    });

    // Persist to localStorage when settings change
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch {
            // Ignore storage errors
        }
    }, [settings]);

    const updateSettings = (newSettings: Partial<LogAnalyzerSettings>) => {
        setSettings((prev) => ({ ...prev, ...newSettings }));
    };

    /**
     * Generate speedometer segments from thresholds
     */
    const getSegments = (): SpeedometerSegment[] => {
        const { redThreshold, yellowThreshold } = settings;
        return [
            { start: 0, end: redThreshold, color: '#ef4444' },
            { start: redThreshold, end: yellowThreshold, color: '#f59e0b' },
            { start: yellowThreshold, end: 100, color: '#22c55e' },
        ];
    };

    /**
     * Get computed date range from settings
     */
    const getDateRange = (): { from: Date; to: Date } => {
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        const { mode, customFrom, customTo } = settings.dateRange;

        switch (mode) {
            case 'today': {
                const from = new Date(today);
                from.setHours(0, 0, 0, 0);
                return { from, to: today };
            }
            case 'last1': {
                const from = new Date(today);
                from.setDate(from.getDate() - 1);
                from.setHours(0, 0, 0, 0);
                return { from, to: today };
            }
            case 'last7': {
                const from = new Date(today);
                from.setDate(from.getDate() - 7);
                from.setHours(0, 0, 0, 0);
                return { from, to: today };
            }
            case 'last30': {
                const from = new Date(today);
                from.setDate(from.getDate() - 30);
                from.setHours(0, 0, 0, 0);
                return { from, to: today };
            }
            case 'custom': {
                const from = customFrom ? new Date(customFrom) : new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
                const to = customTo ? new Date(customTo) : today;
                from.setHours(0, 0, 0, 0);
                to.setHours(23, 59, 59, 999);
                return { from, to };
            }
            default:
                return { from: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000), to: today };
        }
    };

    return (
        <LogAnalyzerSettingsContext.Provider value={{ settings, updateSettings, getSegments, getDateRange }}>
            {children}
        </LogAnalyzerSettingsContext.Provider>
    );
};

// =============================================================================
// HOOK
// =============================================================================

/**
 * Get default speedometer segments (for use outside provider)
 */
export const getDefaultSegments = (): SpeedometerSegment[] => [
    { start: 0, end: 85, color: '#ef4444' },
    { start: 85, end: 95, color: '#f59e0b' },
    { start: 95, end: 100, color: '#22c55e' },
];

/**
 * Safe hook that returns defaults when used outside provider
 */
export const useLogAnalyzerSettingsSafe = (): LogAnalyzerSettingsContextValue => {
    const context = useContext(LogAnalyzerSettingsContext);
    if (!context) {
        // Return defaults when not in provider
        const today = new Date();
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        return {
            settings: DEFAULT_SETTINGS,
            updateSettings: () => { },
            getSegments: getDefaultSegments,
            getDateRange: () => ({ from: weekAgo, to: today }),
        };
    }
    return context;
};

export const useLogAnalyzerSettings = (): LogAnalyzerSettingsContextValue => {
    const context = useContext(LogAnalyzerSettingsContext);
    if (!context) {
        throw new Error('useLogAnalyzerSettings must be used within LogAnalyzerSettingsProvider');
    }
    return context;
};
