import { useState, useMemo } from 'react'
import { CheckSquare, Monitor, CheckCircle, ArrowLeft, WifiOff } from 'lucide-react'

interface Props {
    pcs: any[]
    modelName: string
    onBack: () => void
    onDeploy: (selectedIds: number[]) => void
}

export function PCSelectionView({ pcs, modelName, onBack, onDeploy }: Props) {
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

    const onlinePCs = useMemo(() => pcs.filter(p => p.isOnline), [pcs])
    const hasOnlinePCs = onlinePCs.length > 0

    const isAllSelected = hasOnlinePCs && onlinePCs.every(p => selectedIds.has(p.mcId))
    const selectedCount = selectedIds.size

    const toggleSelectAll = () => {
        if (!hasOnlinePCs) return 

        if (isAllSelected) {
            setSelectedIds(new Set())
        } else {
            const newSet = new Set<number>()
            onlinePCs.forEach(p => newSet.add(p.mcId))
            setSelectedIds(newSet)
        }
    }

    const togglePC = (pc: any) => {
        if (!pc.isOnline) return
        const newSet = new Set(selectedIds)
        if (newSet.has(pc.mcId)) newSet.delete(pc.mcId)
        else newSet.add(pc.mcId)
        setSelectedIds(newSet)
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', animation: 'fadeIn 0.2s ease' }}>

            <div style={{ padding: '0.75rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
                <h3 style={{ fontSize: '0.9rem', margin: 0 }}>Select Targets for "{modelName}"</h3>
            </div>

            {}
            <div
                onClick={hasOnlinePCs ? toggleSelectAll : undefined}
                style={{
                    padding: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    borderBottom: '1px solid var(--border)',
                    fontWeight: 600,
                    
                    cursor: hasOnlinePCs ? 'pointer' : 'not-allowed',
                    opacity: hasOnlinePCs ? 1 : 0.5,
                    background: 'var(--bg-surface)'
                }}
            >
                <div style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '4px',
                    border: '2px solid var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isAllSelected ? 'var(--primary)' : 'transparent',
                    borderColor: isAllSelected ? 'var(--primary)' : 'var(--text-muted)'
                }}>
                    {isAllSelected && <CheckSquare size={12} color="white" />}
                </div>
                <span>Select All Online PCs ({onlinePCs.length})</span>
            </div>

            {}
            <div style={{ flex: 1, overflowY: 'auto', maxHeight: '300px', padding: '0.5rem 0' }}>
                {pcs.length === 0 && (
                    <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        No PCs found for this line.
                    </div>
                )}

                {pcs.map(pc => {
                    const isSelected = selectedIds.has(pc.mcId)
                    return (
                        <div key={pc.mcId} onClick={() => togglePC(pc)} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', marginBottom: '0.25rem', borderRadius: 'var(--radius-sm)', cursor: pc.isOnline ? 'pointer' : 'not-allowed', background: isSelected ? 'rgba(var(--primary-rgb), 0.08)' : 'transparent', opacity: pc.isOnline ? 1 : 0.5 }}>
                            <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: '2px solid var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isSelected ? 'var(--primary)' : 'transparent', borderColor: isSelected ? 'var(--primary)' : 'var(--text-muted)' }}>
                                {isSelected && <CheckSquare size={12} color="white" />}
                            </div>
                            {pc.isOnline ? <Monitor size={18} /> : <WifiOff size={18} color="var(--danger)" />}
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>PC {pc.mcNumber}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{pc.ipAddress}</div>
                            </div>
                            <div style={{ fontSize: '0.65rem', padding: '0.15rem 0.5rem', borderRadius: '10px', background: pc.isOnline ? 'rgba(var(--success-rgb), 0.1)' : 'rgba(var(--danger-rgb), 0.1)', color: pc.isOnline ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                                {pc.isOnline ? 'ONLINE' : 'OFFLINE'}
                            </div>
                        </div>
                    )
                })}
            </div>

            {}
            <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-secondary" onClick={onBack} style={{ flex: 1 }}><ArrowLeft size={16} /> Back</button>
                <button className="btn btn-primary" style={{ flex: 2 }} disabled={selectedCount === 0} onClick={() => onDeploy(Array.from(selectedIds))}>
                    <CheckCircle size={16} style={{ marginRight: '0.5rem' }} /> Deploy to {selectedCount} PCs
                </button>
            </div>
        </div>
    )
}