import { useState, useEffect, useMemo } from 'react';
import { X, BarChart3, Minimize2, Activity, LayoutList, ArrowLeft, ArrowUpFromLine, ArrowDownFromLine, RectangleVertical, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import TrayBarChart from './TrayBarChart';
import BarrelBarChart from './BarrelBarChart';
import BarrelGantt from './BarrelGantt';
import LongGanttChart from './LongGanttChart';
import DrillDownBreadcrumb from './DrillDownBreadcrumb';
import UnifiedDrillLayout, { type ExpandedView } from './UnifiedDrillLayout';

import type { AnalysisResult, OperationData, BarrelTray, Barrel } from '../../types/logTypes';
import logAnalyzerService from '../../features/LogAnalyzer/services/logAnalyzer.service';
import { thumbnailApi } from '../../services/thumbnailApi';
import { useLogAnalyzerContext } from '../../features/LogAnalyzer/context/LogAnalyzerContext';
import LogAnalyzerSettingsModal from './LogAnalyzerSettingsModal';

interface Props {
    result: AnalysisResult;
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
    fontWeight: 600 as const,
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

export default function AnalysisResultsModal({ result, onClose, mcId }: Props) {
    const [isMinimized, setIsMinimized] = useState(false);
    const [activeTab, setActiveTab] = useState<'timeline' | 'analysis'>('analysis');
    const [expandedView, setExpandedView] = useState<ExpandedView>('none');
    const [showLogSettings, setShowLogSettings] = useState(false);

    const {
        showDownloadToast,
        drillDown,
        selectTray,
        navigateToTray,
        navigateToBarrel,
        navigateBack,
        resetDrillDown
    } = useLogAnalyzerContext();

    // Reset drill-down when result changes (new file analyzed)
    useEffect(() => {
        resetDrillDown();
    }, [result.fileName, resetDrillDown]);

    useEffect(() => {
        if (result && result.fileName) {
            setIsMinimized(false);
        }
    }, [result.fileName]);

    // Auto-select first tray on tray-list level
    useEffect(() => {
        if (activeTab === 'analysis' && drillDown.level === 'tray-list' && !drillDown.selectedTrayId && result.trays.length > 0) {
            selectTray(result.trays[0].barrelTrayId);
        }
    }, [activeTab, drillDown.level, drillDown.selectedTrayId, result.trays, selectTray]);

    // Auto-select first barrel when drilling into barrel-detail without a barrel
    useEffect(() => {
        if (drillDown.level === 'barrel-detail' && drillDown.selectedTrayId && drillDown.selectedBarrelId === undefined) {
            const tray = result.trays.find(t => t.barrelTrayId === drillDown.selectedTrayId);
            if (tray && tray.barrels.length > 0) {
                navigateToBarrel(tray.barrelTrayId, tray.barrels[0].barrelId);
            }
        }
    }, [drillDown.level, drillDown.selectedTrayId, drillDown.selectedBarrelId, result.trays, navigateToBarrel]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                if (drillDown.level !== 'tray-list') {
                    navigateBack();
                } else {
                    onClose();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, drillDown.level, navigateBack]);

    // Resolved data based on drill-down state
    const selectedTray: BarrelTray | null = useMemo(() => {
        if (!drillDown.selectedTrayId) return null;
        return result.trays.find(t => t.barrelTrayId === drillDown.selectedTrayId) || null;
    }, [drillDown.selectedTrayId, result.trays]);

    const selectedBarrel: Barrel | null = useMemo(() => {
        if (!selectedTray || drillDown.selectedBarrelId === undefined) return null;
        return selectedTray.barrels.find(b => b.barrelId === drillDown.selectedBarrelId) || null;
    }, [selectedTray, drillDown.selectedBarrelId]);

    // Timeline barrels — scoped to selected tray when drilled in, all otherwise
    const timelineBarrels = useMemo(() => {
        if (drillDown.level === 'barrel-detail' && selectedTray) {
            return selectedTray.barrels;
        }
        return result.trays.flatMap(t => t.barrels);
    }, [drillDown.level, selectedTray, result.trays]);

    // Show timeline tab only when drilled into a tray (not on tray-list level)
    const showTimelineTab = drillDown.level === 'barrel-detail';

    // NG click handler — download images
    const handleNGClick = async (operation: OperationData) => {
        if (mcId == null || !result.fileName) return;
        showDownloadToast();

        try {
            const logFileName = result.fileName.split(/[\\/]/).pop() || result.fileName;
            const thumbs = await thumbnailApi.getThumbnailsForOperation(logFileName, operation.operationName);

            let imagesToDownload: { url: string; filename: string }[] = [];

            if (thumbs.length > 0) {
                imagesToDownload = thumbs.map(t => {
                    const rawPath = t.ngPath || '';
                    const folder = rawPath.substring(0, rawPath.lastIndexOf('\\') + 1);
                    const fullPath = folder + t.filename;
                    return {
                        filename: t.filename,
                        url: logAnalyzerService.getSingleImageUrl(mcId, fullPath)
                    };
                });
            } else if (operation.ngPath) {
                const request = { ngPath: operation.ngPath };
                const response = await logAnalyzerService.getInspectionImages(mcId, request);
                if (response.images?.length > 0) {
                    imagesToDownload = response.images
                        .map(img => ({ url: img.url || '', filename: img.filename }))
                        .filter(i => i.url);
                }
            }

            if (imagesToDownload.length === 0) {
                alert('No images found for this operation.');
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
            console.error('Failed to download images', error);
            alert('Failed to initiate download.');
        }
    };

    // ─── Render functions ──────────────────────────────────────────────────
    // EVERY level uses UnifiedDrillLayout: gantt top, bar chart bottom.

    const renderTrayLevel = () => {
        // Level 1: Top = tray operations gantt (placeholder if empty), Bottom = TrayBarChart
        // Single click tray bar = select (show tray ops in gantt), Double click = drill into barrel-detail
        const trayOpsContent = selectedTray && selectedTray.trayOperations && selectedTray.trayOperations.length > 0 ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: '0.85rem' }}>
                {/* Future: TrayOpsGantt component here when tray-level operations exist */}
                Tray-level operations ({selectedTray.trayOperations.length}) for {selectedTray.barrelTrayId}
            </div>
        ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#334155', fontSize: '0.8rem', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '1.5rem', opacity: 0.3 }}>📊</div>
                <div>Select a tray to view operations</div>
                <div style={{ fontSize: '0.7rem', color: '#475569' }}>Double-click a tray to drill into barrel view</div>
            </div>
        );

        return (
            <UnifiedDrillLayout
                expandedView={expandedView}
                topContent={trayOpsContent}
                bottomContent={
                    <TrayBarChart
                        trays={result.trays}
                        selectedTrayId={drillDown.selectedTrayId ?? null}
                        onTraySelect={(trayId) => selectTray(trayId)}
                        onTrayDrill={(trayId) => navigateToTray(trayId)}
                    />
                }
            />
        );
    };

    const renderBarrelDetailLevel = () => {
        if (!selectedBarrel || !selectedTray) return null;

        return (
            <UnifiedDrillLayout
                expandedView={expandedView}
                topContent={
                    <BarrelGantt
                        key={`${selectedTray.barrelTrayId}_${selectedBarrel.barrelId}`}
                        barrel={selectedBarrel}
                        logFilePath={result.fileName}
                        onNGClick={handleNGClick}
                        mcId={mcId}
                    />
                }
                bottomContent={
                    <BarrelBarChart
                        barrels={selectedTray.barrels}
                        trayId={selectedTray.barrelTrayId}
                        selectedBarrelId={selectedBarrel.barrelId}
                        onBarrelSelect={(barrelId) => navigateToBarrel(selectedTray.barrelTrayId, barrelId)}
                        onBarrelDrill={(barrelId) => navigateToBarrel(selectedTray.barrelTrayId, barrelId)}
                    />
                }
            />
        );
    };

    const renderAnalysisContent = () => {
        switch (drillDown.level) {
            case 'tray-list': return renderTrayLevel();
            case 'barrel-detail': return renderBarrelDetailLevel();
            default: return renderTrayLevel();
        }
    };

    const renderContent = () => (
        <>
            {/* Timeline tab */}
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
                        <LongGanttChart barrels={timelineBarrels} />
                    </div>
                </div>
            </div>

            {/* Analysis tab */}
            <div style={{
                display: activeTab === 'analysis' ? 'flex' : 'none',
                flexDirection: 'column',
                height: '100%',
                overflow: 'hidden'
            }}>
                {renderAnalysisContent()}
            </div>
        </>
    );

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
                    {/* Header */}
                    <div style={{
                        padding: '0.5rem 1rem',
                        background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        flexShrink: 0
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            {/* Back button — only show when drilled in */}
                            {drillDown.level !== 'tray-list' && (
                                <button
                                    onClick={navigateBack}
                                    style={{
                                        ...btnStyle,
                                        padding: '0.3rem 0.5rem',
                                        color: '#60a5fa',
                                        border: '1px solid rgba(96, 165, 250, 0.3)',
                                    }}
                                    title="Back (Esc)"
                                >
                                    <ArrowLeft size={16} />
                                </button>
                            )}

                            {/* Icon + Breadcrumb */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Activity size={16} color="#3b82f6" />
                                </div>
                                <DrillDownBreadcrumb
                                    drillDown={drillDown}
                                    fileName={result.fileName}
                                    onNavigateToTrayList={resetDrillDown}
                                />
                            </div>

                            {/* Tabs — Timeline hidden on tray-list level */}
                            <div style={{ display: 'flex', background: 'var(--bg-app)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                <button style={tabBtnStyle(activeTab === 'analysis')} onClick={() => setActiveTab('analysis')}>
                                    <BarChart3 size={14} /> Analysis
                                </button>
                                {showTimelineTab && (
                                    <button style={tabBtnStyle(activeTab === 'timeline')} onClick={() => setActiveTab('timeline')}>
                                        <LayoutList size={14} /> Timeline
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Right side: Max Seq / Split / Max Bar + window controls */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {activeTab === 'analysis' && (
                                <>
                                    <button style={viewBtnStyle(expandedView === 'top')} onClick={() => setExpandedView(expandedView === 'top' ? 'none' : 'top')} title="Maximize Gantt">
                                        <ArrowUpFromLine size={14} /> Max Seq
                                    </button>
                                    <button style={viewBtnStyle(expandedView === 'none')} onClick={() => setExpandedView('none')} title="Split View">
                                        <RectangleVertical size={14} /> Split
                                    </button>
                                    <button style={viewBtnStyle(expandedView === 'bottom')} onClick={() => setExpandedView(expandedView === 'bottom' ? 'none' : 'bottom')} title="Maximize Bar Chart">
                                        <ArrowDownFromLine size={14} /> Max Bar
                                    </button>
                                    <div style={{ width: 1, height: 20, background: '#334155', margin: '0 0.25rem' }} />
                                </>
                            )}
                            <button style={{ ...btnStyle, color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)' }} onClick={() => setShowLogSettings(true)} title="Log Analyzer Settings">
                                <Settings size={16} />
                            </button>
                            <button className="btn btn-secondary btn-icon" onClick={() => setIsMinimized(true)} style={btnStyle}>
                                <Minimize2 size={16} />
                            </button>
                            <button className="btn btn-secondary btn-icon" onClick={onClose} style={btnStyle}>
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Log Analyzer Settings Modal */}
                    <LogAnalyzerSettingsModal
                        isOpen={showLogSettings}
                        onClose={() => setShowLogSettings(false)}
                        operationNames={result.allOperationNames}
                    />

                    {/* Content */}
                    <div style={{ flex: 1, padding: '0.5rem', overflow: 'hidden', background: '#0f172a' }}>
                        {renderContent()}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}