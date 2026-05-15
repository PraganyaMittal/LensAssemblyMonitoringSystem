import { useState, useEffect, useCallback } from 'react';
import { X, BarChart3, Minimize2, Activity, LayoutList, RectangleVertical, ArrowUpFromLine, ArrowDownFromLine, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import BarrelExecutionChart from './BarrelExecutionChart';
import OperationGanttChart from './OperationGanttChart';
import LongGanttChart from './LongGanttChart';
import SubOperationGanttChart from './SubOperationGanttChart';
import LensTrayBarChart from './LensTrayBarChart';
import SubOperationComparisonModal from './SubOperationComparisonModal';
import type { AnalysisResult, OperationData, TrayLoadData } from '../../types/logTypes';
import logAnalyzerService from '../../features/LogAnalyzer/services/logAnalyzer.service';
import { thumbnailApi } from '../../services/thumbnailApi';
import { useLogAnalyzerContext } from '../../features/LogAnalyzer/context/LogAnalyzerContext';

interface Props {
    result: AnalysisResult;
    selectedBarrel: string | null;
    onBarrelClick: (barrelId: string) => void;
    onClose: () => void;
    mcId?: number; 
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
    mcId
}: Props) {
    const [isMinimized, setIsMinimized] = useState(false);
    const [activeTab, setActiveTab] = useState<'timeline' | 'analysis'>('analysis');
    
    const [expandedView, setExpandedView] = useState<'none' | 'barrel' | 'gantt'>('none');

    const { showDownloadToast } = useLogAnalyzerContext();

    const [drillLevel, setDrillLevel] = useState<1 | 2>(1);
    const [selectedTrayLoad, setSelectedTrayLoad] = useState<TrayLoadData | null>(null);
    const [selectedLensTray, setSelectedLensTray] = useState<string | null>(null);
    
    const [comparisonSubOp, setComparisonSubOp] = useState<string | null>(null);

    useEffect(() => {
        if (activeTab === 'analysis' && !selectedBarrel && result.barrels.length > 0) {
            onBarrelClick(result.barrels[0].barrelId);
        }
    }, [activeTab, selectedBarrel, result.barrels, onBarrelClick]);

    useEffect(() => {
        if (result && result.fileName) {
            setIsMinimized(false);
            
            setDrillLevel(1);
            setSelectedTrayLoad(null);
            setSelectedLensTray(null);
            setComparisonSubOp(null);
        }
    }, [result.fileName]);

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            
            if (comparisonSubOp !== null) {
                return;
            }

            if (drillLevel === 2) {
                setDrillLevel(1);
                setSelectedTrayLoad(null);
                setSelectedLensTray(null);
                e.stopPropagation();
                return;
            }
            e.stopPropagation();
            onClose();
        }
    };

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, drillLevel, comparisonSubOp]);

    const handleTrayLoadClick = useCallback((operation: OperationData) => {
        
        const barrelTrayLoads = (result.trayLoads || []).filter(
            t => t.barrelId === operation.barrelId
        );

        if (barrelTrayLoads.length > 0) {
            const firstTrayLoad = barrelTrayLoads[0];
            setSelectedTrayLoad(firstTrayLoad);
            setSelectedLensTray(firstTrayLoad.lensTrayId);
            setDrillLevel(2);
        }
    }, [result.trayLoads]);

    const handleLensTrayClick = useCallback((lensTrayId: string, index: number) => {
        setSelectedLensTray(lensTrayId);
        const trayLoads = result.trayLoads || [];
        if (trayLoads[index]) {
            setSelectedTrayLoad(trayLoads[index]);
        }
    }, [result.trayLoads]);

    const handleBackToLevel1 = useCallback(() => {
        setDrillLevel(1);
        setSelectedTrayLoad(null);
        setSelectedLensTray(null);
    }, []);

    const handleSubOperationClick = useCallback((operationName: string) => {
        setComparisonSubOp(operationName);
    }, []);

    const handleNGClick = async (operation: OperationData) => {
        if (mcId == null || !result.fileName) return;

        showDownloadToast();

        try {
            
            const logFileName = result.fileName.split(/[\\/]/).pop() || result.fileName;
            const thumbs = await thumbnailApi.getThumbnailsForOperation(logFileName, operation.operationName);

            let imagesToDownload: { url: string; filename: string }[] = [];

            if (thumbs.length > 0) {
                
                imagesToDownload = thumbs.map(t => {
                    const rawPath = t.imagePath || '';
                    const folder = rawPath.endsWith('\\') ? rawPath : rawPath + '\\';
                    const fullPath = folder + t.filename;

                    return {
                        filename: t.filename,
                        url: logAnalyzerService.getSingleImageUrl(mcId, fullPath)
                    };
                });
            } else {
                
                const request = operation.imagePath
                    ? { imagePath: operation.imagePath, barrelId: operation.barrelId }
                    : {
                        modelName: operation.modelName!,
                        trayId: operation.trayId!,
                        barrelId: operation.barrelId,
                        inspectionName: operation.inspectionName!
                    };
                const response = await logAnalyzerService.getInspectionImages(mcId, request);
                if (response.images && response.images.length > 0) {
                    imagesToDownload = response.images.map(img => ({
                        url: img.url || '',
                        filename: img.filename
                    })).filter(i => i.url);
                }
            }

            if (imagesToDownload.length === 0) {
                alert("No images found for this operation.");
                return;
            }

            imagesToDownload.forEach((img, idx) => {
                setTimeout(() => {
                    const link = document.createElement('a');
                    link.href = img.url;
                    link.download = img.filename;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }, idx * 200);
            });

        } catch (error) {
            console.error("Failed to download images", error);
            alert("Failed to initiate download.");
        }
    };

    const selectedBarrelData = selectedBarrel ? result.barrels.find(b => b.barrelId === selectedBarrel) : null;

    const renderGanttSection = () => {
        if (drillLevel === 2 && selectedTrayLoad) {
            
            return (
                <SubOperationGanttChart
                    key={selectedTrayLoad.lensTrayId}
                    subOperations={selectedTrayLoad.subOperations}
                    lensTrayId={selectedTrayLoad.lensTrayId}
                    barrelId={selectedTrayLoad.barrelId}
                    onSubOperationClick={handleSubOperationClick}
                />
            );
        }

        if (selectedBarrelData) {
            return (
                <OperationGanttChart
                    key={selectedBarrel} 
                    operations={selectedBarrelData.operations}
                    barrelId={selectedBarrel || ''}
                    logFilePath={result.fileName}
                    onNGClick={handleNGClick}
                    onTrayLoadClick={handleTrayLoadClick}
                    mcId={mcId}
                />
            );
        }

        return (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
                Select a barrel from the chart below
            </div>
        );
    };

    const renderBarChartSection = () => {
        if (drillLevel === 2) {
            
            const selectedTrayIndex = selectedTrayLoad
                ? (result.trayLoads || []).indexOf(selectedTrayLoad)
                : null;

            return (
                <LensTrayBarChart
                    key={`lens-tray-${result.fileName}`}
                    trayLoads={result.trayLoads || []}
                    selectedLensTray={selectedLensTray}
                    selectedIndex={selectedTrayIndex}
                    onLensTrayClick={handleLensTrayClick}
                />
            );
        }

        return (
            <BarrelExecutionChart
                key={`barrel-exec-${result.fileName}`}
                barrels={result.barrels}
                selectedBarrel={selectedBarrel}
                onBarrelClick={onBarrelClick}
            />
        );
    };

    const renderContent = () => {
        return (
            <>
                {}
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

                {}
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
                                    {renderGanttSection()}
                                </div>
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
                                    {renderBarChartSection()}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </>
        );
    };

    const getHeaderInfo = () => {
        if (drillLevel === 2 && selectedTrayLoad) {
            return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button
                        onClick={handleBackToLevel1}
                        style={{
                            ...btnStyle,
                            padding: '0.15rem 0.4rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            fontSize: '0.75rem',
                            color: '#60a5fa',
                            border: '1px solid #3b82f6',
                        }}
                        title="Back to barrel view"
                    >
                        <ArrowLeft size={14} />
                        Back
                    </button>
                    <span style={{ fontSize: '0.85rem', color: '#60a5fa', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        Lens Tray {selectedLensTray}
                    </span>
                </div>
            );
        }

        if (selectedBarrel) {
            return (
                <span style={{ fontSize: '0.85rem', color: '#60a5fa', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    Sequence: Barrel {selectedBarrel}
                </span>
            );
        }

        return null;
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
                    {}
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

                            {}
                            <div style={{ display: 'flex', background: 'var(--bg-app)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                <button style={tabBtnStyle(activeTab === 'analysis')} onClick={() => setActiveTab('analysis')}>
                                    <BarChart3 size={14} /> Analysis
                                </button>
                                <button style={tabBtnStyle(activeTab === 'timeline')} onClick={() => setActiveTab('timeline')}>
                                    <LayoutList size={14} /> Timeline
                                </button>
                            </div>
                        </div>

                        {}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>

                            {}
                            {activeTab === 'analysis' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', paddingRight: '1rem', borderRight: '1px solid #334155' }}>
                                    {}
                                    {getHeaderInfo()}

                                    {}
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

                            {}
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

                    {}
                    <div style={{ flex: 1, padding: '0.5rem', overflow: 'hidden', background: '#0f172a' }}>
                        {renderContent()}
                    </div>
                </motion.div>
            )}

            {}
            {comparisonSubOp && (
                <SubOperationComparisonModal
                    isOpen={!!comparisonSubOp}
                    operationName={comparisonSubOp}
                    trayLoads={result.trayLoads || []}
                    onClose={() => setComparisonSubOp(null)}
                />
            )}
        </AnimatePresence>
    );
}