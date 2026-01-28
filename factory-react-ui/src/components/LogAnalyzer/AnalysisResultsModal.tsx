import { useState, useEffect } from 'react';
import { X, BarChart3, Minimize2, Activity, FileText, LayoutList, RectangleVertical, ArrowUpFromLine, ArrowDownFromLine, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import BarrelExecutionChart from './BarrelExecutionChart';
import OperationGanttChart from './OperationGanttChart';
import LongGanttChart from './LongGanttChart';
// REMOVED: InspectionImageViewer
import type { AnalysisResult, OperationData } from '../../types/logTypes';
import { logAnalyzerApi } from '../../services/logAnalyzerApi';
import { thumbnailApi } from '../../services/thumbnailApi';

interface Props {
    result: AnalysisResult;
    selectedBarrel: string | null;
    onBarrelClick: (barrelId: string) => void;
    onClose: () => void;
    pcId?: number; // PC ID for fetching inspection images
}

const btnStyle = {
    padding: '0.25rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid #334155',
    borderRadius: '6px',
    background: 'transparent',
    color: '#94a3b8',
    cursor: 'pointer',
    transition: 'all 0.2s'
};

const viewBtnStyle = (isActive: boolean) => ({
    padding: '0.25rem 0.6rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.3rem',
    border: isActive ? '1px solid #3b82f6' : '1px solid #334155',
    borderRadius: '6px',
    background: isActive ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
    color: isActive ? '#60a5fa' : '#94a3b8',
    cursor: 'pointer',
    fontSize: '0.7rem',
    fontWeight: 600,
    transition: 'all 0.2s'
});

const tabBtnStyle = (isActive: boolean) => ({
    padding: '0.35rem 0.75rem',
    borderRadius: '6px',
    border: 'none',
    background: isActive ? '#3b82f6' : 'transparent',
    color: isActive ? '#ffffff' : '#94a3b8',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    transition: 'all 0.2s'
});

export default function AnalysisResultsModal({
    result,
    selectedBarrel,
    onBarrelClick,
    onClose,
    pcId
}: Props) {
    const [isMinimized, setIsMinimized] = useState(false);
    const [activeTab, setActiveTab] = useState<'timeline' | 'analysis' | 'logs'>('analysis');
    // expandedView state: 'none' (70/30 split), 'barrel' (maximized bottom), 'gantt' (maximized top)
    const [expandedView, setExpandedView] = useState<'none' | 'barrel' | 'gantt'>('none');

    // Download Feedback State
    const [downloadingOp, setDownloadingOp] = useState<string | null>(null);

    useEffect(() => {
        if (activeTab === 'analysis' && !selectedBarrel && result.barrels.length > 0) {
            onBarrelClick(result.barrels[0].barrelId);
        }
    }, [activeTab, selectedBarrel, result.barrels, onBarrelClick]);

    // Fix #2: Auto-expand when a new file is analyzed (result changes)
    useEffect(() => {
        if (result && result.fileName) {
            setIsMinimized(false);
        }
    }, [result.fileName]);

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
        }
    };

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    // =========================================================================
    // IMAGE DOWNLOAD LOGIC
    // =========================================================================
    const handleNGClick = async (operation: OperationData) => {
        if (!pcId || !result.fileName) return;

        setDownloadingOp(operation.operationName);
        console.log("Starting download for:", operation.operationName);

        try {
            // 1. Get List of Files (Thumbnails metadata first)
            const logFileName = result.fileName.split(/[\\/]/).pop() || result.fileName;
            const thumbs = await thumbnailApi.getThumbnailsForOperation(logFileName, operation.operationName);

            let imagesToDownload: { url: string; filename: string }[] = [];

            if (thumbs.length > 0) {
                // Construct Lazy-Load URLs
                imagesToDownload = thumbs.map(t => {
                    const rawPath = t.imagePath || '';
                    const folder = rawPath.endsWith('\\') ? rawPath : rawPath + '\\';
                    const fullPath = folder + t.filename;

                    return {
                        filename: t.filename,
                        url: logAnalyzerApi.getSingleImageUrl(pcId, fullPath)
                    };
                });
            } else {
                // Fallback: Bulk API
                const request = operation.imagePath
                    ? { imagePath: operation.imagePath, barrelId: operation.barrelId }
                    : {
                        modelName: operation.modelName!,
                        trayId: operation.trayId!,
                        barrelId: operation.barrelId,
                        inspectionName: operation.inspectionName!
                    };
                const response = await logAnalyzerApi.getInspectionImages(pcId, request);
                if (response.images && response.images.length > 0) {
                    imagesToDownload = response.images.map(img => ({
                        // If URL is provided (new backend), use it. Else fall back to blob logic (not supported here easily without fetching)
                        // The backend 'getInspectionImages' now returns URLs in my previous view_file of Controller?
                        // Controller says: returns "url" and "filename".
                        url: img.url || '',
                        filename: img.filename
                    })).filter(i => i.url);
                }
            }

            if (imagesToDownload.length === 0) {
                alert("No images found for this operation.");
                return;
            }

            // 2. Trigger Downloads
            // We stagger them slightly to allow the browser to register multiple downloads
            imagesToDownload.forEach((img, idx) => {
                setTimeout(() => {
                    const link = document.createElement('a');
                    link.href = img.url;
                    // Force download filename
                    link.download = img.filename;
                    // Note: 'download' attribute only works for same-origin or blob. 
                    // Our API is same-origin (/api/...), so this should work.
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }, idx * 200);
            });

        } catch (error) {
            console.error("Failed to download images", error);
            alert("Failed to initiate download.");
        } finally {
            // Clear status after a moment
            setTimeout(() => setDownloadingOp(null), 2000);
        }
    };

    const selectedBarrelData = selectedBarrel ? result.barrels.find(b => b.barrelId === selectedBarrel) : null;

    // Fix #4: Render all tabs but keep inactive ones hidden to preserve zoom state
    const renderContent = () => {
        return (
            <>
                {/* Timeline Tab - Always mounted to preserve zoom state */}
                <div style={{
                    display: activeTab === 'timeline' ? 'flex' : 'none',
                    height: '100%',
                    flexDirection: 'column'
                }}>
                    <div className="card no-hover" style={{
                        height: '100%',
                        padding: '0.5rem',
                        display: 'flex',
                        flexDirection: 'column'
                    }}>
                        <div style={{ flex: 1, minHeight: 0 }}>
                            <LongGanttChart barrels={result.barrels} />
                        </div>
                    </div>
                </div>

                {/* Analysis Tab */}
                <div style={{
                    display: activeTab === 'analysis' ? 'flex' : 'none',
                    flexDirection: 'column',
                    gap: '4px',
                    height: '100%',
                    overflow: 'hidden'
                }}>
                    <motion.div
                        style={{
                            height: expandedView === 'barrel' ? '0%' : expandedView === 'gantt' ? '100%' : '72%',
                            width: '100%',
                            display: expandedView === 'barrel' ? 'none' : 'flex',
                            flexDirection: 'column',
                            minHeight: 0,
                            overflow: 'hidden'
                        }}
                    >
                        <div className="card no-hover" style={{ height: '100%', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ flex: 1, width: '100%', minHeight: 0, position: 'relative' }}>
                                <div style={{ position: 'absolute', inset: 0 }}>
                                    {selectedBarrelData ? (
                                        <OperationGanttChart
                                            operations={selectedBarrelData.operations}
                                            barrelId={selectedBarrel || ''}
                                            logFilePath={result.fileName}
                                            onNGClick={handleNGClick}
                                            pcId={pcId}
                                        />
                                    ) : (
                                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
                                            Select a barrel from the chart below
                                        </div>
                                    )}
                                </div>
                                {/* Download Overlay */}
                                <AnimatePresence>
                                    {downloadingOp && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0 }}
                                            style={{
                                                position: 'absolute',
                                                bottom: '1rem',
                                                right: '1rem',
                                                background: '#10b981',
                                                color: '#fff',
                                                padding: '0.5rem 1rem',
                                                borderRadius: '6px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem',
                                                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                                                fontSize: '0.85rem',
                                                fontWeight: 600,
                                                zIndex: 50
                                            }}
                                        >
                                            <Download size={16} className="animate-bounce" />
                                            Downloading images...
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </motion.div>

                    <motion.div
                        style={{
                            height: expandedView === 'gantt' ? '0%' : expandedView === 'barrel' ? '100%' : '28%',
                            width: '100%',
                            display: expandedView === 'gantt' ? 'none' : 'flex',
                            flexDirection: 'column',
                            minHeight: 0,
                            overflow: 'hidden'
                        }}
                    >
                        <div className="card no-hover" style={{ height: '100%', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ flex: 1, width: '100%', minHeight: 0, position: 'relative' }}>
                                <div style={{ position: 'absolute', inset: 0 }}>
                                    <BarrelExecutionChart
                                        barrels={result.barrels}
                                        selectedBarrel={selectedBarrel}
                                        onBarrelClick={onBarrelClick}
                                    />
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>

                {/* Logs Tab */}
                <div style={{
                    display: activeTab === 'logs' ? 'flex' : 'none',
                    height: '100%',
                    flexDirection: 'column'
                }}>
                    <div className="card no-hover" style={{ height: '100%', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#0f172a' }}>
                        <pre style={{
                            margin: 0, padding: '1rem', overflow: 'auto', flex: 1,
                            fontFamily: 'JetBrains Mono', fontSize: '0.75rem', color: '#cbd5e1', lineHeight: 1.5
                        }}>
                            {result.rawContent || "Log content not available in analysis mode."}
                        </pre>
                    </div>
                </div>
            </>
        );
    };

    return (
        <AnimatePresence>
            {isMinimized ? (
                <motion.button
                    key="minimized-btn"
                    layoutId="analysis-window"
                    onClick={() => setIsMinimized(false)}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    style={{
                        position: 'fixed', bottom: '2rem', right: '2rem',
                        background: '#3b82f6', border: '1px solid #2563eb', borderRadius: '12px',
                        padding: '0.75rem 1.25rem', cursor: 'pointer', zIndex: 1000,
                        boxShadow: '0 8px 20px rgba(0, 0, 0, 0.3)', color: '#fff', fontWeight: 700
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <BarChart3 size={18} /> Analysis
                    </div>
                </motion.button>
            ) : (
                <motion.div
                    key="maximized-window"
                    layoutId="analysis-window"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="graph-overlay"
                    style={{
                        position: 'fixed', inset: 0, background: 'var(--bg-app)', zIndex: 1000,
                        display: 'flex', flexDirection: 'column', overflow: 'hidden'
                    }}
                >
                    {/* Header & Tabs */}
                    <div style={{
                        padding: '0.5rem 1rem',
                        background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        flexShrink: 0
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Activity size={16} color="#3b82f6" />
                                </div>
                                <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>
                                    {result.fileName || 'Log Analysis'}
                                </h2>
                            </div>

                            {/* TABS */}
                            <div style={{ display: 'flex', background: 'var(--bg-app)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                <button style={tabBtnStyle(activeTab === 'analysis')} onClick={() => setActiveTab('analysis')}>
                                    <BarChart3 size={14} /> Analysis
                                </button>
                                <button style={tabBtnStyle(activeTab === 'timeline')} onClick={() => setActiveTab('timeline')}>
                                    <LayoutList size={14} /> Timeline
                                </button>
                                <button style={tabBtnStyle(activeTab === 'logs')} onClick={() => setActiveTab('logs')}>
                                    <FileText size={14} /> Logs
                                </button>
                            </div>
                        </div>

                        {/* Right Controls */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>

                            {/* Barrel Info & View Controls */}
                            {activeTab === 'analysis' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', paddingRight: '1rem', borderRight: '1px solid #334155' }}>
                                    {/* Barrel Text moved here */}
                                    {selectedBarrel && (
                                        <span style={{ fontSize: '0.85rem', color: '#60a5fa', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                            Sequence: Barrel {selectedBarrel}
                                        </span>
                                    )}

                                    {/* Buttons */}
                                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                                        <button
                                            style={viewBtnStyle(expandedView === 'gantt')}
                                            onClick={() => setExpandedView(expandedView === 'gantt' ? 'none' : 'gantt')}
                                            title="Maximize Sequence"
                                        >
                                            <ArrowUpFromLine size={14} /> Max Seq
                                        </button>
                                        <button
                                            style={viewBtnStyle(expandedView === 'none')}
                                            onClick={() => setExpandedView('none')}
                                            title="Split View"
                                        >
                                            <RectangleVertical size={14} /> Split
                                        </button>
                                        <button
                                            style={viewBtnStyle(expandedView === 'barrel')}
                                            onClick={() => setExpandedView(expandedView === 'barrel' ? 'none' : 'barrel')}
                                            title="Maximize Bar Chart"
                                        >
                                            <ArrowDownFromLine size={14} /> Max Bar
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Window Controls */}
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button className="btn btn-secondary btn-icon" onClick={() => setIsMinimized(true)} style={btnStyle}>
                                    <Minimize2 size={16} />
                                </button>
                                <button className="btn btn-secondary btn-icon" onClick={onClose} style={btnStyle}>
                                    <X size={16} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Content Area */}
                    <div style={{ flex: 1, padding: '0.5rem', overflow: 'hidden', background: '#0f172a' }}>
                        {renderContent()}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}