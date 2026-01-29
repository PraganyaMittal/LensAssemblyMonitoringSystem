import { useMemo, useState, useEffect } from 'react';
import { Server, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { FactoryPC } from '../../types';

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
    // Group Data: Version -> Line -> PCs[]
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

    // Set initial tab to the first version
    useEffect(() => {
        if (versions.length > 0 && !activeTab) {
            setActiveTab(versions[0]);
        }
    }, [versions, activeTab]);

    if (loading) {
        return (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
                <div style={{ width: 24, height: 24, border: '2px solid var(--border)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    const currentLines = activeTab && groupedPCs[activeTab] ? groupedPCs[activeTab] : {};
    const getStatusColor = (isOnline: boolean) => isOnline ? 'var(--success)' : 'var(--danger)';
    const getStatusGlow = (isOnline: boolean) => isOnline ? 'rgba(52, 211, 153, 0.15)' : 'rgba(248, 113, 113, 0.15)';


    return (
        <div className="card no-hover" style={{ padding: 0, height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>

            {/* --- Header & Tabs --- */}
            <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
                <div style={{ padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h2 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Server size={14} color="#3b82f6" />
                        Select MC
                    </h2>

                    {/* Tabs */}
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
                                v{ver}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* --- Scrollable Content --- */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
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

                                {/* Line Divider */}
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    padding: '0 0.25rem',
                                    marginBottom: '0.5rem',
                                    color: 'var(--text-main)',
                                    fontSize: '0.85rem',
                                    fontWeight: 700,
                                    textTransform: 'uppercase'
                                }}>
                                    <Activity size={14} />
                                    Line {lineStr}
                                    <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                                </div>

                                {/* Rectangular Grid */}
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(105px, 1fr))',
                                    gap: '0.5rem'
                                }}>
                                    {linePCs.map((pc) => (
                                        <motion.div
                                            key={pc.mcId}
                                            whileHover={{ scale: 1.02, y: -2 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => onSelectPC(pc)}
                                            style={{
                                                position: 'relative',
                                                padding: '0.5rem',
                                                background: `linear-gradient(135deg, ${getStatusGlow(pc.isOnline)}, var(--bg-card))`,
                                                border: `1px solid ${getStatusColor(pc.isOnline)}`,
                                                borderRadius: '5px',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '0.5rem',
                                                boxShadow: `0 2px 8px ${getStatusGlow(pc.isOnline)}`,
                                                transition: 'box-shadow 0.2s ease'
                                            }}
                                        >
                                            {/* Status Dot (Top Right) */}
                                            <div style={{
                                                position: 'absolute',
                                                top: '4px',
                                                right: '4px',
                                                width: '6px',
                                                height: '6px',
                                                borderRadius: '50%',
                                                background: pc.isOnline ? 'var(--success)' : 'var(--danger)',
                                                boxShadow: pc.isOnline ? '0 0 4px var(--success)' : 'none',
                                                zIndex: 10
                                            }} />

                                            {/* MC Header */}
                                            <div style={{
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                right: 0,
                                                padding: '0.25rem',
                                                fontSize: '0.65rem',
                                                fontWeight: 700,
                                                color: "white",
                                                background: pc.isOnline
                                                    ? 'linear-gradient(135deg, rgba(52, 211, 153, 0.2), rgba(52, 211, 153, 0.1))'
                                                    : 'linear-gradient(135deg, rgba(248, 113, 113, 0.2), rgba(248, 113, 113, 0.1))',
                                                borderBottom: `1px solid ${getStatusColor(pc.isOnline)}`,
                                                borderTopLeftRadius: '5px',
                                                borderTopRightRadius: '5px',
                                                textAlign: 'center',
                                                textTransform: 'uppercase'
                                            }}>
                                                MC-{pc.mcNumber}
                                            </div>

                                            {/* IP Address */}
                                            <div style={{
                                                marginTop: '1.2rem',
                                                fontSize: '0.7rem',
                                                fontWeight: 600,
                                                color: 'var(--text-main)',
                                                textAlign: 'center',
                                                lineHeight: 1.2,
                                                letterSpacing: '0.02em',
                                                whiteSpace: 'nowrap'
                                            }}>
                                                {pc.ipAddress}
                                            </div>

                                        </motion.div>
                                    ))}
                                </div>
                            </div>
                        ))}

                        {Object.keys(currentLines).length === 0 && (
                            <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.5, fontSize: '0.8rem' }}>
                                No MCs on v{activeTab}
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}

