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

export interface ShiftConfig {
    dayShiftStart: string;    // 24h format "08:00"
    nightShiftStart: string;  // 24h format "20:00"
}

export interface AlertConfig {
    threshold: number;        // Yield % below which to alert (default: same as redThreshold)
    cooldownMinutes: number;  // Minutes before same machine can alert again
    historyDays: number;      // Days to retain alert history
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
    /** Shift time configuration */
    shiftConfig: ShiftConfig;
    /** Alert configuration */
    alertConfig: AlertConfig;
}

export interface LogAnalyzerSettingsContextValue {
    settings: LogAnalyzerSettings;
    updateSettings: (newSettings: Partial<LogAnalyzerSettings>) => void;
    getSegments: () => SpeedometerSegment[];
    getDateRange: () => { from: Date; to: Date };
    getCurrentShift: () => 'day' | 'night';
    getShiftTimeRange: (shift: 'day' | 'night') => { start: Date; end: Date };
}

// =============================================================================
// DEFAULTS
// =============================================================================

const DEFAULT_SETTINGS: LogAnalyzerSettings = {
    redThreshold: 85,
    yellowThreshold: 95,
    dateRange: {
        mode: 'last7',
    },
    yieldModeEnabled: true,
    shiftConfig: {
        dayShiftStart: '08:00',
        nightShiftStart: '20:00',
    },
    alertConfig: {
        threshold: 85,        // Same as red threshold by default
        cooldownMinutes: 60,  // 1 hour cooldown
        historyDays: 7,      // Keep 7 days of history by default
    },
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

    // Load alert settings from backend on mount
    useEffect(() => {
        const loadBackendSettings = async () => {
            try {
                const { AlertService } = await import('../../../services/AlertService');
                const backendSettings = await AlertService.getSettings();

                // 1. Update local alert config (thresholds) from backend
                setSettings(prev => ({
                    ...prev,
                    alertConfig: {
                        threshold: backendSettings.threshold,
                        cooldownMinutes: backendSettings.cooldownMinutes,
                        historyDays: backendSettings.historyDays
                    }
                }));

                // 2. Push LOCAL date settings to backend (Ensure backend matches UI state)
                // Use 'settings' from closure (initial state loaded from localStorage)
                // This is best-effort — if it fails, the app still works fine
                try {
                    const payload = {
                        ...backendSettings, // Keep existing values
                        dateMode: settings.dateRange.mode,
                        customFrom: settings.dateRange.customFrom,
                        customTo: settings.dateRange.customTo
                    };
                    await AlertService.updateSettings(payload);
                } catch {
                    // Silently ignore — pushing date sync to backend is non-critical
                }

            } catch (e) {
                console.warn("Failed to load alert settings from backend", e);
            }
        };
        loadBackendSettings();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const updateSettings = (newSettings: Partial<LogAnalyzerSettings>) => {
        setSettings((prev) => {
            const next = { ...prev, ...newSettings };

            // Sync with backend if alert settings OR date range changed
            if (newSettings.alertConfig || newSettings.dateRange) {
                const payload = {
                    ...next.alertConfig,
                    dateMode: next.dateRange.mode,
                    customFrom: next.dateRange.customFrom,
                    customTo: next.dateRange.customTo
                };

                import('../../../services/AlertService').then(({ AlertService }) => {
                    AlertService.updateSettings(payload).catch((e: unknown) =>
                        console.error("Failed to sync settings to backend", e)
                    );
                });
            }

            return next;
        });
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

    /**
     * Get current shift based on time and settings
     */
    const getCurrentShift = (): 'day' | 'night' => {
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        const [dayH, dayM] = settings.shiftConfig.dayShiftStart.split(':').map(Number);
        const [nightH, nightM] = settings.shiftConfig.nightShiftStart.split(':').map(Number);

        const dayStartMinutes = dayH * 60 + dayM;
        const nightStartMinutes = nightH * 60 + nightM;

        // Day shift: from dayStart to nightStart
        if (currentMinutes >= dayStartMinutes && currentMinutes < nightStartMinutes) {
            return 'day';
        }
        return 'night';
    };

    /**
     * Get shift time range for a specific shift
     */
    const getShiftTimeRange = (shift: 'day' | 'night'): { start: Date; end: Date } => {
        const now = new Date();
        const [dayH, dayM] = settings.shiftConfig.dayShiftStart.split(':').map(Number);
        const [nightH, nightM] = settings.shiftConfig.nightShiftStart.split(':').map(Number);

        if (shift === 'day') {
            const start = new Date(now);
            start.setHours(dayH, dayM, 0, 0);
            const end = new Date(now);
            end.setHours(nightH, nightM, 0, 0);
            return { start, end };
        } else {
            // Night shift spans midnight
            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            const dayStartMinutes = dayH * 60 + dayM;

            if (currentMinutes < dayStartMinutes) {
                // After midnight, before day shift
                const start = new Date(now);
                start.setDate(start.getDate() - 1);
                start.setHours(nightH, nightM, 0, 0);
                const end = new Date(now);
                end.setHours(dayH, dayM, 0, 0);
                return { start, end };
            } else {
                // After night shift start, before midnight
                const start = new Date(now);
                start.setHours(nightH, nightM, 0, 0);
                const end = new Date(now);
                end.setDate(end.getDate() + 1);
                end.setHours(dayH, dayM, 0, 0);
                return { start, end };
            }
        }
    };

    return (
        <LogAnalyzerSettingsContext.Provider value={{
            settings,
            updateSettings,
            getSegments,
            getDateRange,
            getCurrentShift,
            getShiftTimeRange
        }}>
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
            getCurrentShift: () => 'day',
            getShiftTimeRange: () => {
                const now = new Date();
                const start = new Date(now);
                start.setHours(8, 0, 0, 0);
                const end = new Date(now);
                end.setHours(20, 0, 0, 0);
                return { start, end };
            },
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
