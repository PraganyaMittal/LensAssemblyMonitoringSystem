import { useState, useEffect } from 'react';
import { ScrollText } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
// 1. Updated Imports
import { useSearchParams } from 'react-router-dom';
import NotFound from './NotFound';

import { factoryApi } from '../services/api';
import { logAnalyzerApi } from '../services/logAnalyzerApi';
import { parseLogContent } from '../utils/logParser';

import LoadingOverlay from '../components/LogAnalyzer/LoadingOverlay';
import PCSelectionList, { type PCWithVersion } from '../components/LogAnalyzer/PCSelectionList';
import LogFileSelector from '../components/LogAnalyzer/LogFileSelector';
import AnalysisResultsModal from '../components/LogAnalyzer/AnalysisResultsModal';
import { OfflineAlertModal } from '../components/OfflineAlertModal';

import type { LogFileNode, AnalysisResult } from '../types/logTypes';

export default function LogAnalyzer() {
    // 2. MODIFIED VALIDATION: Allow params for navigation
    const [searchParams, setSearchParams] = useSearchParams();

    // We allow these keys to exist in the URL
    const allowedKeys = ['pc', 'file', 'alert'];
    const hasUnknownParams = Array.from(searchParams.keys()).some(k => !allowedKeys.includes(k));

    if (hasUnknownParams) {
        return <NotFound />;
    }

    // Read State from URL
    const selectedPCId = searchParams.get('pc');
    const selectedFilePath = searchParams.get('file');
    const activeAlert = searchParams.get('alert');

    // State: Data
    const [pcs, setPCs] = useState<PCWithVersion[]>([]);
    const [logFiles, setLogFiles] = useState<LogFileNode[]>([]);
    const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

    // Derived Selection
    const selectedPC = pcs.find(p => p.pcId.toString() === selectedPCId) || null;

    // Internal UI state
    const [selectedBarrel, setSelectedBarrel] = useState<string | null>(null);
    const [loadingPCs, setLoadingPCs] = useState(true);
    const [loadingFiles, setLoadingFiles] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);

    // Helper for alert: if we selected an offline PC, we might need its data
    // If refreshing on ?alert=offline, we rely on 'pcs' loading
    const offlineAlertPC = activeAlert === 'offline' && selectedPC ? selectedPC : null;

    useEffect(() => {
        loadPCs();
    }, []);

    // Load Files when PC is selected via URL
    useEffect(() => {
        if (selectedPC) {
            loadFilesForPC(selectedPC);
        } else {
            setLogFiles([]);
        }
    }, [selectedPCId]);

    // Analyze File when File is selected via URL
    useEffect(() => {
        if (selectedPC && selectedFilePath) {
            analyzeFile(selectedPC.pcId, selectedFilePath);
        } else {
            setAnalysisResult(null);
        }
    }, [selectedPCId, selectedFilePath]);

    const loadPCs = async () => {
        setLoadingPCs(true);
        try {
            const data = await factoryApi.getPCs();
            const allPCs = data.lines.flatMap((line: any) =>
                line.pcs.map((pc: any) => ({
                    ...pc,
                    version: pc.modelVersion,
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

    const loadFilesForPC = async (pc: PCWithVersion) => {
        setLoadingFiles(true);
        try {
            const structure = await logAnalyzerApi.getLogStructure(pc.pcId);
            setLogFiles(structure.files);
        } catch (error: any) {
            console.error("Failed to load files", error);
        } finally {
            setLoadingFiles(false);
        }
    }

    const analyzeFile = async (pcId: number, filePath: string) => {
        setAnalyzing(true);
        try {
            const contentData = await logAnalyzerApi.getLogFileContent(pcId, filePath);
            const result = parseLogContent(contentData.content, contentData.fileName);
            setAnalysisResult(result);
        } catch (error: any) {
            alert(`Failed to analyze file: ${error.message}`);
            // If failed, pop the file param so we don't get stuck
            setSearchParams(prev => {
                const next = new URLSearchParams(prev);
                next.delete('file');
                return next;
            });
        } finally {
            setAnalyzing(false);
        }
    }

    const handlePCClick = (pc: PCWithVersion) => {
        if (!pc.isOnline) {
            // Push alert state to URL (append)
            setSearchParams({ pc: pc.pcId.toString(), alert: 'offline' });
            return;
        }
        setSearchParams({ pc: pc.pcId.toString() });
    };

    const handleFileClick = (filePath: string) => {
        if (!selectedPC) return;
        setSearchParams({ pc: selectedPC.pcId.toString(), file: filePath });
    };

    const handleBackToPCList = () => {
        setSearchParams({}); // Clear params -> go to root
    };

    const handleCloseAnalysis = () => {
        // Go back to PC details (remove file)
        if (selectedPC) {
            setSearchParams({ pc: selectedPC.pcId.toString() });
        } else {
            setSearchParams({});
        }
        setSelectedBarrel(null);
    };

    const handleCloseOfflineAlert = () => {
        // Remove alert param. If we were viewing PC list, maybe clear PC too if it was invalid?
        // Actually, if it's the main list, we just want to remove the 'alert' and 'pc' 
        // because we failed to select it.
        setSearchParams({});
    };

    const handleBarrelClick = (barrelId: string) => {
        setSelectedBarrel(barrelId);
    };

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <AnimatePresence>
                {analyzing && (
                    <LoadingOverlay
                        message="Processing Log..."
                        submessage="Parsing barrel execution & sequence data"
                    />
                )}
            </AnimatePresence>

            {/* Offline Alert driven by URL */}
            {offlineAlertPC && (
                <OfflineAlertModal
                    offlineCandidates={[{ ...offlineAlertPC, lineNumber: offlineAlertPC.line }]}
                    onCancel={handleCloseOfflineAlert}
                    isBlocking={true}
                    actionLabel="Close"
                    customMessage="You cannot view the log files as this PC is offline."
                />
            )}

            <div className="dashboard-header" >
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
            </div>

            <div className="dashboard-scroll-area" style={{
                flex: 1,
                overflow: 'hidden',
                padding: '1.5rem',
                background: 'var(--bg-app)'
            }}>
                <AnimatePresence mode="wait">
                    {!selectedPC ? (
                        <PCSelectionList
                            pcs={pcs}
                            onSelectPC={handlePCClick}
                            loading={loadingPCs}
                        />
                    ) : (
                        <LogFileSelector
                            logFiles={logFiles}
                            selectedFile={selectedFilePath}
                            onSelectFile={handleFileClick}
                            onBack={handleBackToPCList}
                            loading={loadingFiles}
                            pcInfo={{
                                line: selectedPC.line,
                                pcNumber: selectedPC.pcNumber,
                                logPath: selectedPC.logFilePath
                            }}
                        />
                    )}
                </AnimatePresence>
            </div>

            <AnimatePresence>
                {analysisResult && (
                    <AnalysisResultsModal
                        result={analysisResult}
                        selectedBarrel={selectedBarrel}
                        onBarrelClick={handleBarrelClick}
                        onClose={handleCloseAnalysis}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}