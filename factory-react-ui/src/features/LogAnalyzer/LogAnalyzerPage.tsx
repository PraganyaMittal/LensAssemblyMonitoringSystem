/**
 * LogAnalyzerPage - Refactored main page component
 * 
 * This is a thin "shell" component that:
 * - Uses custom hooks for all business logic
 * - Renders UI components
 * - Is wrapped in ErrorBoundary
 * 
 * All state management is delegated to hooks for testability.
 */
import { useState, useEffect, useCallback } from 'react';
import { ScrollText, Bell, Settings } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';

// Feature module imports
import { useLogStream } from './hooks/useLogStream';
import { useLogAnalysis } from './hooks/useLogAnalysis';
import { LogAnalyzerErrorBoundary } from './components/ErrorBoundary/LogAnalyzerErrorBoundary';

// Legacy component imports (to be gradually refactored)
import MCSelectionList, { type PCWithVersion } from '../../components/LogAnalyzer/MCSelectionList';
import LogFileSelector from '../../components/LogAnalyzer/LogFileSelector';
import AnalysisResultsModal from '../../components/LogAnalyzer/AnalysisResultsModal';
import LoadingOverlay from '../../components/LogAnalyzer/LoadingOverlay';
import { OfflineAlertModal } from '../../components/OfflineAlertModal';

// Log Analyzer components
import { SettingsModal } from './components/SettingsModal';
import { AlertHistoryModal } from './components/AlertHistoryModal/AlertHistoryModal';
import { ShiftTallyCard } from './components/ShiftTallyCard';
import { YieldAlertBanner } from './components/YieldAlertBanner';

import { LogAnalyzerSettingsProvider, AlertProvider, YieldProvider, useAlerts } from './context';

// Services
import { factoryApi } from '../../services/api';

// Page for 404
import NotFound from '../../pages/NotFound';

/**
 * Internal page content (wrapped by Error Boundary).
 */
function LogAnalyzerPageContent() {
    const [searchParams] = useSearchParams();

    // Strict validation: This page expects NO query parameters
    if (Array.from(searchParams.keys()).length > 0) {
        return <NotFound />;
    }

    // =========================================================================
    // STATE
    // =========================================================================

    // PC List state
    const [pcs, setPCs] = useState<PCWithVersion[]>([]);
    const [loadingPCs, setLoadingPCs] = useState(true);
    const [selectedPC, setSelectedPC] = useState<PCWithVersion | null>(null);

    // Offline alert
    const [offlineAlertPC, setOfflineAlertPC] = useState<PCWithVersion | null>(null);

    // Settings modal
    const [showSettings, setShowSettings] = useState(false);
    const [showHistory, setShowHistory] = useState(false);

    // Barrel selection for analysis view
    // Barrel selection for analysis view
    const [selectedBarrel, setSelectedBarrel] = useState<string | null>(null);

    // Alert context for badge
    const { alerts } = useAlerts();
    const unseenCount = alerts.filter(a => !a.isAcknowledged).length;

    // =========================================================================
    // CUSTOM HOOKS
    // =========================================================================

    // Log file structure (with polling)
    const {
        logFiles,
        isLoading: loadingFiles,
        reset: resetLogStream,
    } = useLogStream({
        mcId: selectedPC?.mcId ?? null,
        pollingInterval: 5000,
        enabled: selectedPC !== null,
    });

    // Log analysis workflow
    const {
        status: analysisStatus,
        result: analysisResult,
        isLoading: analyzing,
        analyzeFile,
        reset: resetAnalysis,
    } = useLogAnalysis({
        mcId: selectedPC?.mcId ?? null,
        onError: (error) => {
            alert(`Failed to analyze file: ${error.message}`);
        },
    });

    // =========================================================================
    // LOAD PCS (on mount)
    // =========================================================================

    useEffect(() => {
        const loadPCs = async () => {
            setLoadingPCs(true);
            try {
                const data = await factoryApi.getPCs();
                const allPCs: PCWithVersion[] = data.lines.flatMap((line) =>
                    line.pcs.map((pc) => ({
                        ...pc,
                        version: pc.modelVersion,
                        line: line.lineNumber,
                        logFilePath: (pc as { logFilePath?: string }).logFilePath ?? ''
                    }))
                );
                setPCs(allPCs);
            } catch (error) {
                console.error('Failed to load PCs:', error);
            } finally {
                setLoadingPCs(false);
            }
        };
        loadPCs();
    }, []);

    // =========================================================================
    // HANDLERS
    // =========================================================================

    const handlePCClick = useCallback((pc: PCWithVersion) => {
        if (!pc.isOnline) {
            setOfflineAlertPC(pc);
            return;
        }
        setSelectedPC(pc);
        setSelectedBarrel(null);
        resetAnalysis();
    }, [resetAnalysis]);

    const handleFileClick = useCallback(async (filePath: string) => {
        await analyzeFile(filePath);
    }, [analyzeFile]);

    const handleBarrelClick = useCallback((barrelId: string) => {
        setSelectedBarrel(barrelId);
    }, []);

    const handleBack = useCallback(() => {
        setSelectedPC(null);
        resetLogStream();
        resetAnalysis();
        setSelectedBarrel(null);
    }, [resetLogStream, resetAnalysis]);

    const handleCloseAnalysis = useCallback(() => {
        resetAnalysis();
        setSelectedBarrel(null);
    }, [resetAnalysis]);

    // =========================================================================
    // RENDER
    // =========================================================================

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Loading Overlays */}
            <AnimatePresence>
                {analyzing && (
                    <LoadingOverlay
                        message="Processing Log..."
                        submessage="Parsing barrel execution & sequence data"
                    />
                )}
            </AnimatePresence>

            {/* Offline Alert Modal */}
            {offlineAlertPC && (
                <OfflineAlertModal
                    offlineCandidates={[{ ...offlineAlertPC, lineNumber: offlineAlertPC.line }]}
                    onCancel={() => setOfflineAlertPC(null)}
                    isBlocking={true}
                    actionLabel="Close"
                    customMessage="You cannot view the log files as this MC is offline."
                />
            )}

            {/* Header */}
            <header className="dashboard-header">

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: 'var(--radius-md)',
                        background: 'linear-gradient(135deg, #3b82f6, #10b981)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.25)'
                    }}>
                        <ScrollText size={22} color="#ffffff" aria-hidden="true" />
                    </div>
                    <div>
                        <h1 style={{
                            fontSize: '1.1rem',
                            fontWeight: 700,
                            margin: 0
                        }}>
                            Log Analyzer
                        </h1>
                    </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8 }}>
                    {/* Alert History Button */}
                    <button
                        onClick={() => setShowHistory(true)}
                        style={{
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            borderRadius: '8px',
                            padding: '8px 12px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            color: '#ef4444',
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            transition: 'background 0.2s',
                            position: 'relative', // For badge positioning
                        }}
                    >
                        <Bell size={16} />
                        Alerts
                        {unseenCount > 0 && (
                            <span style={{
                                position: 'absolute',
                                top: -6,
                                right: -6,
                                background: '#ef4444',
                                color: 'white',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                borderRadius: '999px',
                                minWidth: '18px',
                                height: '18px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '0 4px',
                                border: '2px solid var(--bg-app, #0f172a)'
                            }}>
                                {unseenCount > 99 ? '99+' : unseenCount}
                            </span>
                        )}
                    </button>

                    {/* Settings Button */}
                    <button
                        onClick={() => setShowSettings(true)}
                        style={{
                            background: 'rgba(255,255,255,0.1)',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background 0.2s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                        aria-label="Open settings"
                    >
                        <Settings size={20} color="var(--text-main, #f1f5f9)" />
                    </button>
                </div>
            </header>

            {/* Settings Modal */}
            < SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)
            } />
            < AlertHistoryModal isOpen={showHistory} onClose={() => setShowHistory(false)} />

            {/* Main Content */}
            <main
                className="dashboard-scroll-area"
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                }}
                role="main"
                aria-label="Log Analyzer content"
            >
                <AnimatePresence mode="wait">
                    {!selectedPC ? (
                        <div
                            className="flex flex-col gap-6"
                            style={{
                                height: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '1.5rem', // fallback for gap-6
                                overflow: 'hidden' // Ensure container doesn't overflow parent
                            }}
                        >
                            <YieldAlertBanner />
                            <ShiftTallyCard />
                            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                <MCSelectionList
                                    pcs={pcs}
                                    onSelectPC={handlePCClick}
                                    loading={loadingPCs}
                                />
                            </div>
                        </div>
                    ) : (
                        <LogFileSelector
                            logFiles={logFiles}
                            selectedFile={analysisStatus === 'complete' ? analysisResult?.fileName ?? null : null}
                            onSelectFile={handleFileClick}
                            onBack={handleBack}
                            loading={loadingFiles}
                            pcInfo={{
                                line: selectedPC.line,
                                mcNumber: selectedPC.mcNumber,
                                logPath: selectedPC.logFilePath ?? ''
                            }}
                        />
                    )}
                </AnimatePresence>
            </main>

            {/* Analysis Modal */}
            <AnimatePresence>
                {analysisStatus === 'complete' && analysisResult && (
                    <AnalysisResultsModal
                        result={analysisResult}
                        selectedBarrel={selectedBarrel}
                        onBarrelClick={handleBarrelClick}
                        onClose={handleCloseAnalysis}
                        mcId={selectedPC?.mcId}
                    />
                )}
            </AnimatePresence>
        </div >
    );
}

/**
 * LogAnalyzerPage - Wrapped with Error Boundary and Settings Provider
 */
export default function LogAnalyzerPage() {
    return (
        <LogAnalyzerSettingsProvider>
            <AlertProvider>
                <YieldProvider>
                    <LogAnalyzerErrorBoundary>
                        <LogAnalyzerPageContent />
                    </LogAnalyzerErrorBoundary>
                </YieldProvider>
            </AlertProvider>
        </LogAnalyzerSettingsProvider>
    );
}

