import { useState, useEffect } from 'react';
import { ScrollText } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
// 1. Add Imports
import { useSearchParams } from 'react-router-dom';
import NotFound from './NotFound';

import { factoryApi } from '../services/api';
import { logAnalyzerApi } from '../services/logAnalyzerApi';
import { parseLogContent } from '../utils/logParser';

import LoadingOverlay from '../components/LogAnalyzer/LoadingOverlay';
import MCSelectionList, { type PCWithVersion } from '../components/LogAnalyzer/MCSelectionList';
import LogFileSelector from '../components/LogAnalyzer/LogFileSelector';
import AnalysisResultsModal from '../components/LogAnalyzer/AnalysisResultsModal';
import { OfflineAlertModal } from '../components/OfflineAlertModal';

import type { LogFileNode, AnalysisResult } from '../types/logTypes';

export default function LogAnalyzer() {
    // 2. STRICT VALIDATION: This page expects NO query parameters
    const [searchParams] = useSearchParams();
    if (Array.from(searchParams.keys()).length > 0) {
        return <NotFound />;
    }

    // State: Data
    const [pcs, setPCs] = useState<PCWithVersion[]>([]);
    const [logFiles, setLogFiles] = useState<LogFileNode[]>([]);
    const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

    // State: Selection
    const [selectedPC, setSelectedPC] = useState<PCWithVersion | null>(null);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [selectedBarrel, setSelectedBarrel] = useState<string | null>(null);

    // State: Offline Alert
    const [offlineAlertPC, setOfflineAlertPC] = useState<PCWithVersion | null>(null);

    // State: UI/Loading
    const [loadingPCs, setLoadingPCs] = useState(true);
    const [loadingFiles, setLoadingFiles] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);

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

    const handlePCClick = async (pc: PCWithVersion) => {
        // Check if PC is offline - show alert popup
        if (!pc.isOnline) {
            setOfflineAlertPC(pc);
            return;
        }

        setSelectedPC(pc);
        setLogFiles([]); // Clear first
        setSelectedFile(null);
        setAnalysisResult(null);
        setSelectedBarrel(null);

        // Initial Load
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

    // POLLING: Refresh structure every 5 seconds while PC is selected
    useEffect(() => {
        if (!selectedPC) return;

        const intervalId = setInterval(async () => {
            try {
                // Silent update (no loading spinner)
                const structure = await logAnalyzerApi.getLogStructure(selectedPC.mcId);
                setLogFiles(structure.files);
            } catch (error) {
                console.warn("Log structure poll failed", error);
            }
        }, 5000);

        return () => clearInterval(intervalId);
    }, [selectedPC]);

    // DIRECT ANALYSIS WORKFLOW
    const handleFileClick = async (filePath: string) => {
        if (!selectedPC) return;

        setSelectedFile(filePath);
        setAnalyzing(true);

        try {
            // 1. Fetch Content
            const contentData = await logAnalyzerApi.getLogFileContent(selectedPC.mcId, filePath);

            // 2. Parse Immediately
            // We pass the fileName to the parser to store it in the result
            const result = parseLogContent(contentData.content, contentData.fileName);

            // 3. Open Analysis Modal Directly
            setAnalysisResult(result);

        } catch (error: any) {
            alert(`Failed to analyze file: ${error.message}`);
            setSelectedFile(null);
        } finally {
            setAnalyzing(false);
        }
    };

    const handleBarrelClick = (barrelId: string) => {
        setSelectedBarrel(barrelId);
    };

    const handleCloseOfflineAlert = () => {
        setOfflineAlertPC(null);
    };

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
                    onCancel={handleCloseOfflineAlert}
                    isBlocking={true}
                    actionLabel="Close"
                    customMessage="You cannot view the log files as this PC is offline."
                />
            )}

            {/* Header */}
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

            {/* Main Content */}
            <div className="dashboard-scroll-area" style={{
                flex: 1,
                overflow: 'hidden',
                padding: '1.5rem',
                background: 'var(--bg-app)'
            }}>
                <AnimatePresence mode="wait">
                    {!selectedPC ? (
                        <MCSelectionList
                            pcs={pcs}
                            onSelectPC={handlePCClick}
                            loading={loadingPCs}
                        />
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

            {/* Analysis Modal (Replaces old File Viewer) */}
            <AnimatePresence>
                {analysisResult && (
                    <AnalysisResultsModal
                        result={analysisResult}
                        selectedBarrel={selectedBarrel}
                        onBarrelClick={handleBarrelClick}
                        onClose={() => {
                            setAnalysisResult(null);
                            setSelectedBarrel(null);
                            setSelectedFile(null); // Reset selection to allow re-clicking same file
                        }}
                        mcId={selectedPC?.mcId}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}