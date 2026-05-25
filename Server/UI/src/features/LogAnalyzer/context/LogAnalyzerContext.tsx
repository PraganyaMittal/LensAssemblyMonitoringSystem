import { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export interface DrillDownState {
    level: 'tray-list' | 'barrel-detail';
    selectedTrayId?: string;
    selectedBarrelId?: number;
}

const INITIAL_DRILL_DOWN: DrillDownState = { level: 'tray-list' };

interface LogAnalyzerContextType {
    loading: boolean;
    loadingMessage: string;
    loadingSubmessage?: string;
    setLoading: (isLoading: boolean, message?: string, submessage?: string) => void;
    showDownloadToast: () => void;
    hideDownloadToast: () => void;
    drillDown: DrillDownState;
    /** Single-click: select tray to show its operations in gantt (stays on tray-list) */
    selectTray: (trayId: string) => void;
    /** Double-click: drill into tray → barrel-detail with first barrel */
    navigateToTray: (trayId: string) => void;
    navigateToBarrel: (trayId: string, barrelId: number) => void;
    navigateBack: () => void;
    resetDrillDown: () => void;
}

const LogAnalyzerContext = createContext<LogAnalyzerContextType | undefined>(undefined);

export const useLogAnalyzerContext = () => {
    const context = useContext(LogAnalyzerContext);
    if (!context) {
        throw new Error('useLogAnalyzerContext must be used within a LogAnalyzerProvider');
    }
    return context;
};

export const LogAnalyzerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [loading, setLoadingState] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('Loading...');
    const [loadingSubmessage, setLoadingSubmessage] = useState<string | undefined>(undefined);
    const [downloadToastVisible, setDownloadToastVisible] = useState(false);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [drillDown, setDrillDown] = useState<DrillDownState>(INITIAL_DRILL_DOWN);

    const setLoading = (isLoading: boolean, message?: string, submessage?: string) => {
        setLoadingState(isLoading);
        if (message) setLoadingMessage(message);
        if (submessage) setLoadingSubmessage(submessage);
    };

    const showDownloadToast = () => {
        setDownloadToastVisible(true);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => {
            setDownloadToastVisible(false);
        }, 3000); 
    };

    const hideDownloadToast = () => {
        setDownloadToastVisible(false);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };

    const selectTray = useCallback((trayId: string) => {
        setDrillDown(prev => ({ ...prev, level: 'tray-list', selectedTrayId: trayId }));
    }, []);

    const navigateToTray = useCallback((trayId: string) => {
        // Double-click on tray: drill into barrel-detail with first barrel
        // The actual barrel selection is handled by AnalysisResultsModal
        setDrillDown({ level: 'barrel-detail', selectedTrayId: trayId, selectedBarrelId: undefined });
    }, []);

    const navigateToBarrel = useCallback((trayId: string, barrelId: number) => {
        setDrillDown({ level: 'barrel-detail', selectedTrayId: trayId, selectedBarrelId: barrelId });
    }, []);

    const navigateBack = useCallback(() => {
        setDrillDown(INITIAL_DRILL_DOWN);
    }, []);

    const resetDrillDown = useCallback(() => {
        setDrillDown(INITIAL_DRILL_DOWN);
    }, []);

    useEffect(() => {
        return () => {
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        };
    }, []);

    return (
        <LogAnalyzerContext.Provider value={{ loading, loadingMessage, loadingSubmessage, setLoading, showDownloadToast, hideDownloadToast, drillDown, selectTray, navigateToTray, navigateToBarrel, navigateBack, resetDrillDown }}>
            {children}
            {}
            <AnimatePresence>
                {downloadToastVisible && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        style={{
                            position: 'fixed',
                            bottom: '2rem',
                            left: '2rem',
                            background: 'rgba(15, 23, 42, 0.95)',
                            padding: '10px 16px',
                            paddingRight: '36px',
                            borderRadius: '8px',
                            backdropFilter: 'blur(8px)',
                            zIndex: 99999,
                            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
                            border: '1px solid #334155',
                            pointerEvents: 'auto',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px'
                        }}
                    >
                        {}
                        <div style={{
                            width: '14px',
                            height: '14px',
                            border: '2px solid rgba(255, 255, 255, 0.2)',
                            borderTopColor: '#38bdf8',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite'
                        }} />
                        <span style={{
                            color: '#e2e8f0',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            letterSpacing: '0.01em',
                            whiteSpace: 'nowrap'
                        }}>
                            Downloading images, it may take few seconds
                        </span>

                        {}
                        <button
                            onClick={hideDownloadToast}
                            style={{
                                position: 'absolute',
                                right: '8px',
                                background: 'transparent',
                                border: 'none',
                                borderRadius: '4px',
                                width: '20px',
                                height: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#94a3b8',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                                e.currentTarget.style.color = '#fff';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.color = '#94a3b8';
                            }}
                        >
                            <X size={14} />
                        </button>

                        <style>{`
                            @keyframes spin {
                                to { transform: rotate(360deg); }
                            }
                        `}</style>
                    </motion.div>
                )}
            </AnimatePresence>
        </LogAnalyzerContext.Provider>
    );
};
