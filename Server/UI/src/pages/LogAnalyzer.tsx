import { useState, useEffect, useCallback } from 'react';
import { ScrollText, Settings, Bell } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

import { useSearchParams } from 'react-router-dom';
import NotFound from './NotFound';

import { factoryApi } from '../services/api';
import { logAnalyzerApi } from '../services/logAnalyzerApi';
import { parseLogContent } from '../features/LogAnalyzer/utils/logParser';

import LoadingOverlay from '../components/LogAnalyzer/LoadingOverlay';
import MCSelectionList, { type PCWithVersion } from '../components/LogAnalyzer/MCSelectionList';
import LogFileSelector from '../components/LogAnalyzer/LogFileSelector';
import AnalysisResultsModal from '../components/LogAnalyzer/AnalysisResultsModal';
import { OfflineAlertModal } from '../components/OfflineAlertModal';

import type { LogFileNode, AnalysisResult } from '../types/logTypes';

import { eventBus, EVENTS } from '../utils/eventBus';

import { LogAnalyzerProvider, useLogAnalyzerContext } from '../contexts/LogAnalyzerContext';

import { SettingsModal } from '../features/LogAnalyzer/components/SettingsModal';
import { LogAnalyzerSettingsProvider, AlertProvider, YieldProvider, SignalRProvider, useAlerts } from '../features/LogAnalyzer/context';

import { AlertHistoryModal } from '../features/LogAnalyzer/components/AlertHistoryModal/AlertHistoryModal';

function LogAnalyzerContent() {
    
    const [searchParams] = useSearchParams();
    if (Array.from(searchParams.keys()).length > 0) {
        return <NotFound />;
    }

    const { loading, loadingMessage, loadingSubmessage, setLoading } = useLogAnalyzerContext();

    const { alerts } = useAlerts();
    const unreadCount = alerts.filter(a => !a.isAcknowledged).length;

    const [pcs, setPCs] = useState<PCWithVersion[]>([]);
    const [logFiles, setLogFiles] = useState<LogFileNode[]>([]);
    const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

    const [selectedPC, setSelectedPC] = useState<PCWithVersion | null>(null);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [selectedBarrel, setSelectedBarrel] = useState<string | null>(null);

    const [offlineAlertPC, setOfflineAlertPC] = useState<PCWithVersion | null>(null);

    const [showSettings, setShowSettings] = useState(false);
    const [showHistory, setShowHistory] = useState(false);

    const [loadingPCs, setLoadingPCs] = useState(true);
    const [loadingFiles, setLoadingFiles] = useState(false);

    const goHome = useCallback(() => {
        setSelectedPC(null);
        setSelectedFile(null);
        setSelectedBarrel(null);
        setLogFiles([]);
        setAnalysisResult(null);
    }, []);

    useEffect(() => {
        eventBus.on(EVENTS.LOG_ANALYZER_HOME, goHome);
        return () => {
            eventBus.off(EVENTS.LOG_ANALYZER_HOME, goHome);
        };
    }, [goHome]);

    useEffect(() => {
        loadPCs();
    }, []);

    const loadPCs = async () => {
        setLoadingPCs(true);
        try {
            const data = await factoryApi.getPCs();
            const allPCs = data.lines.flatMap((line: any) =>
                line.pcs.map((pc: any) => ({
                    ...pc,
                    version: pc.generationNo,
                    line: line.lineNumber
                }))
            );
            setPCs(allPCs);
        } catch (error) {
            console.error('Failed to load PCs:', error);
        } finally {
            setLoadingPCs(false);
        }
    };

    const handlePCClick = async (pc: PCWithVersion) => {
        
        if (!pc.isOnline) {
            setOfflineAlertPC(pc);
            return;
        }

        setSelectedPC(pc);
        setLogFiles([]); 
        setSelectedFile(null);
        setAnalysisResult(null);
        setSelectedBarrel(null);

        setLoadingFiles(true);
        try {
            const structure = await logAnalyzerApi.getLogStructure(pc.mcId);
            setLogFiles(structure.files);
        } catch (error: any) {
            alert(`Failed to load log files: ${error.message}`);
        } finally {
            setLoadingFiles(false);
        }
    };

    useEffect(() => {
        if (!selectedPC) return;

        const intervalId = setInterval(async () => {
            try {
                
                const structure = await logAnalyzerApi.getLogStructure(selectedPC.mcId);
                setLogFiles(structure.files);
            } catch (error) {
                console.warn("Log structure poll failed", error);
            }
        }, 5000);

        return () => clearInterval(intervalId);
    }, [selectedPC]);

    const handleFileClick = async (filePath: string) => {
        if (!selectedPC) return;

        setSelectedFile(filePath);
        setLoading(true, "Processing Log...", "Parsing barrel execution & sequence data");

        try {
            
            const contentData = await logAnalyzerApi.getLogFileContent(selectedPC.mcId, filePath);

            const result = parseLogContent(contentData.content, contentData.fileName);

            setAnalysisResult(result);

        } catch (error: any) {
            alert(`Failed to analyze file: ${error.message}`);
            setSelectedFile(null);
        } finally {
            setLoading(false);
        }
    };

    const handleBarrelClick = (barrelId: string) => {
        setSelectedBarrel(barrelId);
    };

    const handleCloseOfflineAlert = () => {
        setOfflineAlertPC(null);
    };

    return (
        <div className="main-content">
            {}
            <AnimatePresence>
                {loading && (
                    <LoadingOverlay
                        message={loadingMessage}
                        submessage={loadingSubmessage}
                    />
                )}
            </AnimatePresence>

            {}
            {offlineAlertPC && (
                <OfflineAlertModal
                    offlineCandidates={[{ ...offlineAlertPC, lineNumber: offlineAlertPC.line }]}
                    onCancel={handleCloseOfflineAlert}
                    isBlocking={true}
                    actionLabel="Close"
                    customMessage="You cannot view the log files as this PC is offline."
                />
            )}

            {}
            <div className="dashboard-header">
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
                        <ScrollText size={22} color="#ffffff" />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            Log Analyzer
                        </h1>
                    </div>
                </div>

                {}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {}
                    <button
                        onClick={() => setShowHistory(true)}
                        style={{
                            background: unreadCount > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                            border: unreadCount > 0 ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(239, 68, 68, 0.2)',
                            borderRadius: '8px',
                            padding: '6px 10px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            color: '#ef4444',
                            fontWeight: 600,
                            fontSize: '0.8rem',
                            transition: 'all 0.2s',
                            position: 'relative'
                        }}
                    >
                        <div style={{ position: 'relative', display: 'flex' }}>
                            <motion.div
                                animate={unreadCount > 0 ? {
                                    rotate: [0, -15, 15, -15, 15, 0],
                                    transition: {
                                        duration: 0.5,
                                        repeat: Infinity,
                                        repeatDelay: 2
                                    }
                                } : {}}
                            >
                                <Bell size={16} />
                            </motion.div>
                            {unreadCount > 0 && (
                                <span style={{
                                    position: 'absolute',
                                    top: -4,
                                    right: -4,
                                    width: 8,
                                    height: 8,
                                    background: '#ef4444',
                                    borderRadius: '50%',
                                    border: '1px solid var(--bg-app, #0f172a)'
                                }} />
                            )}
                        </div>
                        Alerts
                        {unreadCount > 0 && (
                            <span style={{
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
                                marginLeft: 2
                            }}>
                                {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                        )}
                    </button>

                    {}
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
                        title="Yield Analyzer Settings"
                    >
                        <Settings size={18} color="var(--text-main, #f1f5f9)" />
                    </button>
                </div>
            </div>

            {}
            <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
            <AlertHistoryModal isOpen={showHistory} onClose={() => setShowHistory(false)} />

            {}
            <div className="dashboard-scroll-area" style={{
                display: 'flex',
                flexDirection: 'column'
            }}>
                <AnimatePresence mode="wait">
                    {!selectedPC ? (
                        <div className="flex flex-col gap-4" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <MCSelectionList
                                pcs={pcs}
                                onSelectPC={handlePCClick}
                                loading={loadingPCs}
                            />

                        </div>
                    ) : (
                        <LogFileSelector
                            logFiles={logFiles}
                            selectedFile={selectedFile}
                            onSelectFile={handleFileClick}
                            onBack={() => {
                                setSelectedPC(null);
                                setLogFiles([]);
                                setSelectedFile(null);
                                setAnalysisResult(null);
                            }}
                            loading={loadingFiles}
                            pcInfo={{
                                line: selectedPC.line,
                                mcNumber: selectedPC.mcNumber,
                                logPath: selectedPC.logFilePath
                            }}
                        />
                    )}
                </AnimatePresence>
            </div>

            {}
            <AnimatePresence>
                {analysisResult && (
                    <AnalysisResultsModal
                        result={analysisResult}
                        selectedBarrel={selectedBarrel}
                        onBarrelClick={handleBarrelClick}
                        onClose={() => {
                            setAnalysisResult(null);
                            setSelectedBarrel(null);
                            setSelectedFile(null); 
                        }}
                        mcId={selectedPC?.mcId}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

export default function LogAnalyzer() {
    return (
        <LogAnalyzerSettingsProvider>
            <SignalRProvider>
                <AlertProvider>
                    <YieldProvider>
                        <LogAnalyzerProvider>
                            <LogAnalyzerContent />
                        </LogAnalyzerProvider>
                    </YieldProvider>
                </AlertProvider>
            </SignalRProvider>
        </LogAnalyzerSettingsProvider>
    );
}