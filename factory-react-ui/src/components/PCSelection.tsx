import { useState, useMemo } from 'react'
import { CheckSquare, Monitor, CheckCircle, ArrowLeft, WifiOff } from 'lucide-react'

interface Props {
    pcs: any[]
    modelName: string
    onBack: () => void
    onDeploy: (selectedIds: number[]) => void
}

export function PCSelectionView({ pcs, modelName, onBack, onDeploy }: Props) {
    // Default to empty set (User must select) OR Default to all Online (Uncomment line below)
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

    const onlinePCs = useMemo(() => pcs.filter(p => p.isOnline), [pcs])
    const isAllSelected = onlinePCs.length > 0 && onlinePCs.every(p => selectedIds.has(p.pcId))
    const selectedCount = selectedIds.size

    const toggleSelectAll = () => {
        if (isAllSelected) {
            setSelectedIds(new Set())
        } else {
            const newSet = new Set<number>()
            onlinePCs.forEach(p => newSet.add(p.pcId))
            setSelectedIds(newSet)
        }
    }

    const togglePC = (pc: any) => {
        if (!pc.isOnline) return
        const newSet = new Set(selectedIds)
        if (newSet.has(pc.pcId)) newSet.delete(pc.pcId)
        else newSet.add(pc.pcId)
        setSelectedIds(newSet)
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', animation: 'fadeIn 0.2s ease' }}>

            <div style={{ padding: '0.75rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
                <h3 style={{ fontSize: '0.9rem', margin: 0 }}>Select Targets for "{modelName}"</h3>
            </div>            {/* Select All */}
            <div onClick={toggleSelectAll} style={{ padding: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontWeight: 600 }}>
                <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: '2px solid var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isAllSelected ? 'var(--primary)' : 'transparent', borderColor: isAllSelected ? 'var(--primary)' : 'var(--text-muted)' }}>
                    {isAllSelected && <CheckSquare size={12} color="white" />}
                </div>
                <span>Select All Online PCs ({onlinePCs.length})</span>
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto', maxHeight: '300px', padding: '0.5rem 0' }}>
                {pcs.map(pc => {
                    const isSelected = selectedIds.has(pc.pcId)
                    return (
                        <div key={pc.pcId} onClick={() => togglePC(pc)} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', marginBottom: '0.25rem', borderRadius: 'var(--radius-sm)', cursor: pc.isOnline ? 'pointer' : 'not-allowed', background: isSelected ? 'rgba(var(--primary-rgb), 0.08)' : 'transparent', opacity: pc.isOnline ? 1 : 0.5 }}>
                            <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: '2px solid var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isSelected ? 'var(--primary)' : 'transparent', borderColor: isSelected ? 'var(--primary)' : 'var(--text-muted)' }}>
                                {isSelected && <CheckSquare size={12} color="white" />}
                            </div>
                            {pc.isOnline ? <Monitor size={18} /> : <WifiOff size={18} color="var(--danger)" />}
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>PC {pc.pcNumber}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{pc.ipAddress}</div>
                            </div>
                            <div style={{ fontSize: '0.65rem', padding: '0.15rem 0.5rem', borderRadius: '10px', background: pc.isOnline ? 'rgba(var(--success-rgb), 0.1)' : 'rgba(var(--danger-rgb), 0.1)', color: pc.isOnline ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                                {pc.isOnline ? 'ONLINE' : 'OFFLINE'}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Footer */}
            <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-secondary" onClick={onBack} style={{ flex: 1 }}><ArrowLeft size={16} /> Back</button>
                <button className="btn btn-primary" style={{ flex: 2 }} disabled={selectedCount === 0} onClick={() => onDeploy(Array.from(selectedIds))}>
                    <CheckCircle size={16} style={{ marginRight: '0.5rem' }} /> Deploy to {selectedCount} PCs
                </button>
            </div>
        </div>
    )
}