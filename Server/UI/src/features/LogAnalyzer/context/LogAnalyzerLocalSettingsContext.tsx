
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LogAnalyzerLocalSettings {
    /** Per-operation ideal time overrides (ms). Key = operation name. */
    idealTimes: Record<string, number>;
    /** Default ideal time (ms) when log doesn't include idealMs and no per-op override exists. */
    defaultIdealMs: number;
    /** Global ideal barrel execution time (ms) — used for bar chart threshold. */
    idealBarrelTimeMs: number;
    /** Global ideal tray execution time (ms) — used for tray bar chart threshold. */
    idealTrayTimeMs: number;
}

export interface LogAnalyzerLocalSettingsContextValue {
    settings: LogAnalyzerLocalSettings;
    updateSettings: (patch: Partial<LogAnalyzerLocalSettings>) => void;
    /** Get ideal time for a specific operation. Priority: per-op override > log idealMs > defaultIdealMs */
    getIdealTime: (operationName: string, logIdealMs?: number) => number;
    /** Bulk-register discovered operation names (only adds missing keys with defaultIdealMs). */
    registerOperationNames: (names: string[]) => void;
}

const DEFAULT_SETTINGS: LogAnalyzerLocalSettings = {
    idealTimes: {},
    defaultIdealMs: 1000,
    idealBarrelTimeMs: 8500,
    idealTrayTimeMs: 60000,
};

const STORAGE_KEY = 'log-analyzer-local-settings';

const LogAnalyzerLocalSettingsContext = createContext<LogAnalyzerLocalSettingsContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────────────────────────

export const LogAnalyzerLocalSettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [settings, setSettings] = useState<LogAnalyzerLocalSettings>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
            }
        } catch { /* ignore */ }
        return DEFAULT_SETTINGS;
    });

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch { /* ignore */ }
    }, [settings]);

    const updateSettings = useCallback((patch: Partial<LogAnalyzerLocalSettings>) => {
        setSettings(prev => ({ ...prev, ...patch }));
    }, []);

    const getIdealTime = useCallback((operationName: string, logIdealMs?: number): number => {
        // Priority: per-op override > log idealMs > defaultIdealMs
        if (settings.idealTimes[operationName] !== undefined) {
            return settings.idealTimes[operationName];
        }
        if (logIdealMs !== undefined && logIdealMs > 0) {
            return logIdealMs;
        }
        return settings.defaultIdealMs;
    }, [settings.idealTimes, settings.defaultIdealMs]);

    const registerOperationNames = useCallback((names: string[]) => {
        setSettings(prev => {
            const updated = { ...prev.idealTimes };
            let changed = false;
            for (const name of names) {
                if (!(name in updated)) {
                    updated[name] = prev.defaultIdealMs;
                    changed = true;
                }
            }
            if (!changed) return prev;
            return { ...prev, idealTimes: updated };
        });
    }, []);

    return (
        <LogAnalyzerLocalSettingsContext.Provider value={{
            settings,
            updateSettings,
            getIdealTime,
            registerOperationNames,
        }}>
            {children}
        </LogAnalyzerLocalSettingsContext.Provider>
    );
};

// ─── Hooks ──────────────────────────────────────────────────────────────────

export const useLogAnalyzerLocalSettings = (): LogAnalyzerLocalSettingsContextValue => {
    const context = useContext(LogAnalyzerLocalSettingsContext);
    if (!context) {
        throw new Error('useLogAnalyzerLocalSettings must be used within LogAnalyzerLocalSettingsProvider');
    }
    return context;
};

export const useLogAnalyzerLocalSettingsSafe = (): LogAnalyzerLocalSettingsContextValue => {
    const context = useContext(LogAnalyzerLocalSettingsContext);
    if (!context) {
        return {
            settings: DEFAULT_SETTINGS,
            updateSettings: () => {},
            getIdealTime: (_name: string, logIdealMs?: number) => logIdealMs ?? DEFAULT_SETTINGS.defaultIdealMs,
            registerOperationNames: () => {},
        };
    }
    return context;
};
