import { useEffect } from 'react'
import { X } from 'lucide-react'

interface ConfirmModalProps {
    title: string
    message: string
    onConfirm: () => void
    onCancel: () => void
}

export const ConfirmModal = ({ title, message, onConfirm, onCancel }: ConfirmModalProps) => {
    // --- NEW: Handle Escape Key ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onCancel()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [onCancel])
    // ------------------------------

    return (
        <div className="modal-overlay" onClick={onCancel} style={{ zIndex: 2200 }}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px', animation: 'fadeIn 0.2s' }}>
                <div className="modal-header">
                    <h3 style={{ fontSize: '1rem', margin: 0 }}>{title}</h3>
                    <button onClick={onCancel} className="btn btn-secondary btn-icon"><X size={18} /></button>
                </div>
                <div className="modal-body">
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '1.5rem', whiteSpace: 'pre-line' }}>{message}</p>
                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
                        <button className="btn btn-primary" onClick={onConfirm}>Confirm</button>
                    </div>
                </div>
            </div>
        </div>
    )
}