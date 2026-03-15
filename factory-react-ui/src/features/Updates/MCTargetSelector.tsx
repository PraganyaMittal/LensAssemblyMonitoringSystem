import { useState, useEffect } from 'react';
import { Monitor, Wifi, WifiOff, CheckSquare, Square, ChevronDown, ChevronRight } from 'lucide-react';
import { updateApi } from '../../services/updateApi';
import type { MCTarget, TargetType } from '../../types/updateTypes';

interface MCTargetSelectorProps {
    targetType: TargetType;
    onTargetTypeChange: (type: TargetType) => void;
    onFilterChange: (filter: string | undefined) => void;
    onTargetCountChange: (total: number, online: number) => void;
}


export default function MCTargetSelector({
    targetType,
    onTargetTypeChange,
    onFilterChange,
    onTargetCountChange
}: MCTargetSelectorProps) {
    const [targets, setTargets] = useState<MCTarget[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedMCIds, setSelectedMCIds] = useState<Set<number>>(new Set());
    const [selectedLines, setSelectedLines] = useState<Set<number>>(new Set());
    const [selectedVersion, setSelectedVersion] = useState('');
    const [expandedLines, setExpandedLines] = useState<Set<number>>(new Set());

    useEffect(() => {
        loadTargets();
    }, []);

    const loadTargets = async () => {
        try {
            const data = await updateApi.getAvailableTargets();
            setTargets(data);
            
            setExpandedLines(new Set(data.map(t => t.lineNumber)));
        } catch (err) {
            console.error('Failed to load targets:', err);
        } finally {
            setLoading(false);
        }
    };

    
    const lineGroups = targets.reduce<Record<number, MCTarget[]>>((acc, mc) => {
        if (!acc[mc.lineNumber]) acc[mc.lineNumber] = [];
        acc[mc.lineNumber].push(mc);
        return acc;
    }, {});

    
    const versions = [...new Set(targets.map(t => t.modelVersion))].sort();

    
    useEffect(() => {
        let matched: MCTarget[] = [];
        let filter: string | undefined;

        switch (targetType) {
            case 'All':
                matched = targets;
                filter = undefined;
                break;
            case 'ByVersion':
                if (selectedVersion) {
                    matched = targets.filter(t => t.modelVersion === selectedVersion);
                    filter = JSON.stringify({ version: selectedVersion });
                }
                break;
            case 'ByLine':
                if (selectedLines.size > 0) {
                    const lines = [...selectedLines];
                    matched = targets.filter(t => selectedLines.has(t.lineNumber));
                    filter = JSON.stringify({ lineNumbers: lines });
                }
                break;
            case 'SelectedMCs':
                if (selectedMCIds.size > 0) {
                    const mcIds = [...selectedMCIds];
                    matched = targets.filter(t => selectedMCIds.has(t.mcId));
                    filter = JSON.stringify({ mcIds });
                }
                break;
        }

        onFilterChange(filter);
        onTargetCountChange(matched.length, matched.filter(m => m.isOnline).length);
    }, [targetType, selectedVersion, selectedLines, selectedMCIds, targets]);

    const toggleLine = (line: number) => {
        setExpandedLines(prev => {
            const next = new Set(prev);
            next.has(line) ? next.delete(line) : next.add(line);
            return next;
        });
    };

    const toggleSelectLine = (line: number) => {
        setSelectedLines(prev => {
            const next = new Set(prev);
            next.has(line) ? next.delete(line) : next.add(line);
            return next;
        });
    };

    const toggleMC = (mcId: number) => {
        setSelectedMCIds(prev => {
            const next = new Set(prev);
            next.has(mcId) ? next.delete(mcId) : next.add(mcId);
            return next;
        });
    };

    const selectAllMCsInLine = (line: number) => {
        const lineMCs = lineGroups[line] || [];
        const allSelected = lineMCs.every(mc => selectedMCIds.has(mc.mcId));
        setSelectedMCIds(prev => {
            const next = new Set(prev);
            lineMCs.forEach(mc => allSelected ? next.delete(mc.mcId) : next.add(mc.mcId));
            return next;
        });
    };

    if (loading) {
        return <div style={{ padding: '1rem', color: 'var(--text-dim)' }}>Loading available targets...</div>;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {(['All', 'ByVersion', 'ByLine', 'SelectedMCs'] as TargetType[]).map(type => (
                    <button
                        key={type}
                        onClick={() => onTargetTypeChange(type)}
                        style={{
                            padding: '0.4rem 0.8rem',
                            borderRadius: '6px',
                            border: targetType === type ? '1px solid var(--accent)' : '1px solid var(--border)',
                            background: targetType === type ? 'var(--accent)' : 'transparent',
                            color: targetType === type ? '#000' : 'var(--text)',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: targetType === type ? 600 : 400,
                            transition: 'all 0.2s'
                        }}
                    >
                        {type === 'All' && '🌐 All MCs'}
                        {type === 'ByVersion' && '📌 By Version'}
                        {type === 'ByLine' && '📍 By Line'}
                        {type === 'SelectedMCs' && '✅ Select MCs'}
                    </button>
                ))}
            </div>

            {}
            {targetType === 'ByVersion' && (
                <select
                    value={selectedVersion}
                    onChange={e => setSelectedVersion(e.target.value)}
                    style={{
                        padding: '0.5rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'var(--card-bg)',
                        color: 'var(--text)',
                        fontSize: '0.85rem'
                    }}
                >
                    <option value="">Select version...</option>
                    {versions.map(v => (
                        <option key={v} value={v}>
                            Version {v} ({targets.filter(t => t.modelVersion === v).length} MCs)
                        </option>
                    ))}
                </select>
            )}

            {}
            {(targetType === 'ByLine' || targetType === 'SelectedMCs') && (
                <div style={{
                    maxHeight: '250px',
                    overflowY: 'auto',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '0.5rem'
                }}>
                    {Object.entries(lineGroups).map(([line, mcs]) => {
                        const lineNum = Number(line);
                        const expanded = expandedLines.has(lineNum);
                        const onlineCount = mcs.filter(m => m.isOnline).length;

                        return (
                            <div key={lineNum} style={{ marginBottom: '0.25rem' }}>
                                {}
                                <div
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                                        padding: '0.4rem 0.5rem', cursor: 'pointer',
                                        borderRadius: '6px',
                                        background: 'var(--bg-secondary)',
                                    }}
                                >
                                    <span onClick={() => toggleLine(lineNum)} style={{ cursor: 'pointer' }}>
                                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </span>

                                    {targetType === 'ByLine' && (
                                        <span onClick={() => toggleSelectLine(lineNum)} style={{ cursor: 'pointer' }}>
                                            {selectedLines.has(lineNum)
                                                ? <CheckSquare size={14} color="var(--accent)" />
                                                : <Square size={14} />}
                                        </span>
                                    )}
                                    {targetType === 'SelectedMCs' && (
                                        <span onClick={() => selectAllMCsInLine(lineNum)} style={{ cursor: 'pointer', fontSize: '0.7rem', color: 'var(--accent)' }}>
                                            Select All
                                        </span>
                                    )}

                                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }}
                                        onClick={() => toggleLine(lineNum)}>
                                        Line {lineNum}
                                    </span>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                                        {mcs.length} MCs • {onlineCount} online
                                    </span>
                                </div>

                                {}
                                {expanded && targetType === 'SelectedMCs' && (
                                    <div style={{ paddingLeft: '1.5rem', paddingTop: '0.25rem' }}>
                                        {mcs.map(mc => (
                                            <div
                                                key={mc.mcId}
                                                onClick={() => toggleMC(mc.mcId)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                    padding: '0.3rem 0.5rem', cursor: 'pointer',
                                                    borderRadius: '4px', fontSize: '0.8rem',
                                                }}
                                            >
                                                {selectedMCIds.has(mc.mcId)
                                                    ? <CheckSquare size={13} color="var(--accent)" />
                                                    : <Square size={13} />}
                                                <Monitor size={13} />
                                                <span>MC-{mc.mcNumber}</span>
                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>v{mc.modelVersion}</span>
                                                {mc.isOnline
                                                    ? <Wifi size={11} color="#22c55e" />
                                                    : <WifiOff size={11} color="#6b7280" />
                                                }
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
