
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { SpeedometerSegment } from '../components/Speedometer';

export type DateRangeMode = 'today' | 'last1' | 'last7' | 'last30' | 'custom';

export interface DateRangeSettings {
    mode: DateRangeMode;
    customFrom?: string;  
    customTo?: string;    
}

export interface AlertConfig {
    threshold: number;        
    cooldownMinutes: number;  
    historyDays: number;      
}

export interface LogAnalyzerSettings {
    redThreshold: number;
    yellowThreshold: number;
    dateRange: DateRangeSettings;
    yieldModeEnabled: boolean;
    alertConfig: AlertConfig;
}

export interface LogAnalyzerSettingsContextValue {
    settings: LogAnalyzerSettings;
    updateSettings: (newSettings: Partial<LogAnalyzerSettings>) => void;
    getSegments: () => SpeedometerSegment[];
    getDateRange: () => { from: Date; to: Date };
}

const DEFAULT_SETTINGS: LogAnalyzerSettings = {
    redThreshold: 85,
    yellowThreshold: 95,
    dateRange: {
        mode: 'last7',
    },
    yieldModeEnabled: true,
    alertConfig: {
        threshold: 85,        
        cooldownMinutes: 60,  
        historyDays: 7,      
    },
};

const STORAGE_KEY = 'log-analyzer-settings';

const LogAnalyzerSettingsContext = createContext<LogAnalyzerSettingsContextValue | null>(null);

export const LogAnalyzerSettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [settings, setSettings] = useState<LogAnalyzerSettings>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                // Clean up old keys that were removed
                delete parsed.shiftConfig;
                delete parsed.idealTimes;
                return { ...DEFAULT_SETTINGS, ...parsed };
            }
        } catch {
            
        }
        return DEFAULT_SETTINGS;
    });

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch {
            
        }
    }, [settings]);

    useEffect(() => {
        const loadBackendSettings = async () => {
            try {
                const { AlertService } = await import('../../../services/AlertService');
                const backendSettings = await AlertService.getSettings();

                setSettings(prev => ({
                    ...prev,
                    alertConfig: {
                        threshold: backendSettings.threshold,
                        cooldownMinutes: backendSettings.cooldownMinutes,
                        historyDays: backendSettings.historyDays
                    }
                }));

                try {
                    const payload = {
                        ...backendSettings, 
                        dateMode: settings.dateRange.mode,
                        customFrom: settings.dateRange.customFrom,
                        customTo: settings.dateRange.customTo
                    };
                    await AlertService.updateSettings(payload);
                } catch {
                    
                }

            } catch (e) {
                console.warn("Failed to load alert settings from backend", e);
            }
        };
        loadBackendSettings();
        
    }, []);

    const updateSettings = (newSettings: Partial<LogAnalyzerSettings>) => {
        setSettings((prev) => {
            const next = { ...prev, ...newSettings };

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

    const getSegments = (): SpeedometerSegment[] => {
        const { redThreshold, yellowThreshold } = settings;
        return [
            { start: 0, end: redThreshold, color: '#ef4444' },
            { start: redThreshold, end: yellowThreshold, color: '#f59e0b' },
            { start: yellowThreshold, end: 100, color: '#22c55e' },
        ];
    };

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
        <LogAnalyzerSettingsContext.Provider value={{
            settings,
            updateSettings,
            getSegments,
            getDateRange,
        }}>
            {children}
        </LogAnalyzerSettingsContext.Provider>
    );
};

export const getDefaultSegments = (): SpeedometerSegment[] => [
    { start: 0, end: 85, color: '#ef4444' },
    { start: 85, end: 95, color: '#f59e0b' },
    { start: 95, end: 100, color: '#22c55e' },
];

export const useLogAnalyzerSettingsSafe = (): LogAnalyzerSettingsContextValue => {
    const context = useContext(LogAnalyzerSettingsContext);
    if (!context) {
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
