
import { useMemo, useState, useEffect, useCallback } from 'react';
import { Server, ChevronDown, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { FactoryPC } from '../../types';
import YieldHistoryModal from './YieldHistoryModal';


import { useLogAnalyzerSettingsSafe, useYield } from '../../features/LogAnalyzer/context';


import { UnifiedMachineCard, type UnifiedMachineData } from '../../features/LogAnalyzer/components/UnifiedMachineCard';
import { YieldAnalyticsModal, type MachineYieldData } from '../../features/LogAnalyzer/components/YieldAnalyticsModal';




export interface PCWithVersion extends FactoryPC {
    version: string;
    line: number;
    logFilePath: string;
}

interface Props {
    pcs: PCWithVersion[];
    onSelectPC: (pc: PCWithVersion) => void;
    loading: boolean;
}

export default function MCSelectionList({ pcs, onSelectPC, loading }: Props) {
    
    const { yieldSummary } = useYield();
    const [historyMC, setHistoryMC] = useState<PCWithVersion | null>(null);

    
    const [collapsedLines, setCollapsedLines] = useState<Record<string, boolean>>({});

    const toggleLineCollapse = (version: string, line: number) => {
        const key = `${version}-${line}`;
        setCollapsedLines(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };



    
    const [analyticsMode, setAnalyticsMode] = useState<'machine' | 'line' | null>(null);
    const [analyticsMachine, setAnalyticsMachine] = useState<UnifiedMachineData | null>(null);
    const [analyticsLine, setAnalyticsLine] = useState<{ lineNumber: number; machines: MachineYieldData[] } | null>(null);

    
    const { settings } = useLogAnalyzerSettingsSafe();

    
    const groupedPCs = useMemo(() => {
        return pcs.reduce((acc: Record<string, Record<number, PCWithVersion[]>>, pc) => {
            if (!acc[pc.version]) acc[pc.version] = {};
            if (!acc[pc.version][pc.line]) acc[pc.version][pc.line] = [];
            acc[pc.version][pc.line].push(pc);
            return acc;
        }, {});
    }, [pcs]);

    const versions = useMemo(() => Object.keys(groupedPCs).sort(), [groupedPCs]);

    const [activeTab, setActiveTab] = useState<string>('');

    
    useEffect(() => {
        if (versions.length > 0 && !activeTab) {
            setActiveTab(versions[0]);
        }
    }, [versions, activeTab]);

    
    
    const currentLines = activeTab && groupedPCs[activeTab] ? groupedPCs[activeTab] : {};

    
    
    
    
    
    
    
    
    
    
    
    
    

    
    const getLineYield = (linePCs: PCWithVersion[]): number => {
        let total = 0;
        const count = linePCs.length;

        linePCs.forEach(pc => {
            const val = yieldSummary[pc.mcId] || 0;
            total += val;
        });

        return count > 0 ? total / count : 0;
    };

    
    const toMachineData = (pc: PCWithVersion): UnifiedMachineData => ({
        mcId: pc.mcId,
        mcNumber: pc.mcNumber,
        ipAddress: pc.ipAddress,
        isOnline: pc.isOnline,
        line: pc.line,
        yield: yieldSummary[pc.mcId] || 0,
    });

    
    
    const handleCardClick = useCallback((machine: UnifiedMachineData) => {
        const pc = pcs.find(p => p.mcId === machine.mcId);
        if (pc) onSelectPC(pc);
    }, [pcs, onSelectPC]);

    
    const handleYieldClick = useCallback((machine: UnifiedMachineData) => {
        setAnalyticsMachine(machine as any);
        setAnalyticsMode('machine');
    }, []);

    
    const handleLineClick = (lineNumber: number, linePCs: PCWithVersion[]) => {
        const machines: MachineYieldData[] = linePCs.map(pc => ({
            mcId: pc.mcId,
            mcNumber: pc.mcNumber,
            yield: yieldSummary[pc.mcId] || 0,
        }));
        setAnalyticsLine({ lineNumber, machines });
        setAnalyticsMode('line');
    };

    
    const closeAnalytics = () => {
        setAnalyticsMode(null);
        setAnalyticsMachine(null);
        setAnalyticsLine(null);
    };

    const handleHistoryClick = useCallback((machine: UnifiedMachineData) => {
        const pc = pcs.find(p => p.mcId === machine.mcId);
        if (pc) setHistoryMC(pc);
    }, [pcs]);

    if (loading) {
        return (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
                <div style={{ width: 24, height: 24, border: '2px solid var(--border)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );


    }

    return (
        <div className="card no-hover" style={{ padding: 0, height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>

            <YieldHistoryModal
                isOpen={!!historyMC}
                onClose={() => setHistoryMC(null)}
                mcId={historyMC?.mcId || 0}
                mcName={historyMC?.mcNumber?.toString() || ''}
            />

            {}
            <YieldAnalyticsModal
                isOpen={analyticsMode !== null}
                onClose={closeAnalytics}
                mode={analyticsMode || 'machine'}
                machine={analyticsMachine ? {
                    mcId: analyticsMachine.mcId,
                    mcNumber: analyticsMachine.mcNumber,
                    yield: analyticsMachine.yield ?? 0,
                } : undefined}
                lineInfo={analyticsLine || undefined}
                onMachineClick={(machine) => {
                    
                    setAnalyticsLine(null);
                    setAnalyticsMachine({
                        mcId: machine.mcId,
                        mcNumber: machine.mcNumber,
                        ipAddress: '',
                        isOnline: true,
                        line: 0,
                        yield: machine.yield,
                    });
                    setAnalyticsMode('machine');
                }}
            />

            {}
            <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
                <div style={{ padding: '0.15rem 0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h2 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Server size={14} color="#3b82f6" />
                        Select MC
                    </h2>

                    {}

                    {}
                    <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-main)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                        {versions.map(ver => (
                            <button
                                key={ver}
                                onClick={() => setActiveTab(ver)}
                                style={{
                                    border: 'none',
                                    background: activeTab === ver ? '#3b82f6' : 'transparent',
                                    color: activeTab === ver ? '#fff' : 'var(--text-dim)',
                                    padding: '0.2rem 0.6rem',
                                    borderRadius: '4px',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {ver}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {}
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0.5rem', minHeight: 0 }}>
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.15 }}
                    >
                        {Object.entries(currentLines).map(([lineStr, linePCs]) => (
                            <div key={lineStr} style={{ marginBottom: '0.75rem' }}>
                                {}
                                <div
                                    onClick={() => toggleLineCollapse(activeTab, parseInt(lineStr, 10))}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        padding: '0.15rem 0.4rem',
                                        marginBottom: '0.25rem',
                                        background: 'var(--bg-surface, rgba(255, 255, 255, 0.03))',
                                        border: '1px solid var(--border)',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        userSelect: 'none',
                                        transition: 'background 0.2s',
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-surface, rgba(255, 255, 255, 0.03))'}
                                >
                                    {}
                                    <div style={{ color: '#3b82f6', marginRight: '0.25rem', display: 'flex' }}>
                                        {collapsedLines[`${activeTab}-${lineStr}`] ? (
                                            <ChevronRight size={14} />
                                        ) : (
                                            <ChevronDown size={14} />
                                        )}
                                    </div>

                                    {}
                                    <span style={{
                                        fontSize: '0.85rem',
                                        fontWeight: 600,
                                        color: '#3b82f6',
                                        letterSpacing: '0.02em',
                                    }}>
                                        Line {lineStr}
                                    </span>

                                    {}
                                    {(() => {
                                        const lineYield = getLineYield(linePCs);
                                        
                                        const yieldColorVar = lineYield >= settings.yellowThreshold ? 'var(--success)' : lineYield >= settings.redThreshold ? 'var(--warning)' : 'var(--danger)';

                                        return (
                                            <div
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleLineClick(parseInt(lineStr, 10), linePCs);
                                                }}
                                                style={{
                                                    marginLeft: 'auto',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '3px',
                                                    padding: '1px 6px',
                                                    borderRadius: '8px',
                                                    background: 'var(--bg-hover)',
                                                    border: '1px solid var(--border-subtle)',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(0.95)'}
                                                onMouseLeave={(e) => e.currentTarget.style.filter = 'none'}
                                                title="View Line Analytics"
                                            >
                                                <span style={{
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    color: yieldColorVar,
                                                }}>
                                                    Yield:
                                                </span>
                                                <span style={{
                                                    fontSize: '0.85rem',
                                                    fontWeight: 700,
                                                    color: yieldColorVar,
                                                }}>
                                                    {lineYield.toFixed(1)}%
                                                </span>
                                            </div>
                                        );
                                    })()}
                                </div>

                                {}
                                {!collapsedLines[`${activeTab}-${lineStr}`] && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.2 }}
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(auto-fill, minmax(95px, 1fr))',
                                            gap: '0.5rem',
                                            overflow: 'hidden',
                                            padding: '10px',
                                            margin: '-10px'
                                        }}
                                    >
                                        {linePCs.map((pc) => (
                                            <div style={{ width: '100%' }} key={pc.mcId}>
                                                <UnifiedMachineCard
                                                    machine={toMachineData(pc)}
                                                    onCardClick={handleCardClick}
                                                    onYieldClick={handleYieldClick}
                                                    onHistoryClick={handleHistoryClick}
                                                />
                                            </div>
                                        ))}
                                    </motion.div>
                                )}
                            </div>
                        ))}

                        {Object.keys(currentLines).length === 0 && (
                            <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.5, fontSize: '0.8rem' }}>
                                No MCs on {activeTab}
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div >
    );
}
