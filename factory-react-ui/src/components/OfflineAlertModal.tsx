import { useEffect } from 'react'
import { X, Wifi, AlertTriangle } from 'lucide-react'

interface OfflineAlertModalProps {
    offlineCandidates: any[]
    onCancel: () => void
    onProceedOnlineOnly?: () => void
    actionLabel?: string
    isBlocking?: boolean
    customMessage?: string 
}

export const OfflineAlertModal = ({
    offlineCandidates,
    onCancel,
    onProceedOnlineOnly,
    actionLabel,
    isBlocking = false,
    customMessage 
}: OfflineAlertModalProps) => {

    
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onCancel()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [onCancel])

    
    const grouped = offlineCandidates.reduce((acc: any, pc: any) => {
        const line = pc.lineNumber || 'Unknown'
        if (!acc[line]) acc[line] = []
        acc[line].push(pc)
        return acc
    }, {})

    return (
        <div className="modal-overlay" onClick={onCancel} style={{ zIndex: 2000 }}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', height: 'auto', border: '1px solid var(--danger)' }}>
                <div className="modal-header">
                    <h3 style={{ fontSize: '1.05rem', margin: 0, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {isBlocking ? <AlertTriangle size={18} /> : <Wifi size={18} />}
                        {isBlocking ? 'Action Blocked' : 'Offline Agents Detected'}
                    </h3>
                    <button onClick={onCancel} className="btn btn-secondary btn-icon"><X size={18} /></button>
                </div>
                <div className="modal-body">
                    <div style={{ marginBottom: '1rem', background: 'var(--bg-hover)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
                        <p style={{ fontSize: '0.9rem', margin: '0 0 0.5rem 0', fontWeight: 600 }}>
                            {isBlocking ? 'The target agent is currently OFFLINE:' : 'The following MCs are OFFLINE:'}
                        </p>

                        <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {Object.entries(grouped).map(([line, pcs]: [string, any]) => (
                                <div key={line} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', minWidth: '50px' }}>Line {line}:</span>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                        {pcs.map((p: any, i: number) => (
                                            <span key={i} className="badge badge-neutral" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}>
                                                MC {p.mcNumber}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                    </div>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                        {}
                        {customMessage ? customMessage : (
                            isBlocking
                                ? 'You cannot edit this agent while it is offline. Please ensure the MC is connected and running the agent to perform this action.'
                                : 'Changes cannot be applied to offline agents. Proceeding will apply the action ONLY to the Online MCs.'
                        )}
                    </p>

                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                        {isBlocking ? (
                            <button className="btn btn-secondary" onClick={onCancel}>Close</button>
                        ) : (
                            <>
                                <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
                                <button className="btn btn-primary" onClick={onProceedOnlineOnly}>
                                    {actionLabel || 'Proceed with Online Only'}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

