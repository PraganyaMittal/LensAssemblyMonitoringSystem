import { useEffect } from 'react'
import { X, CheckCircle, AlertTriangle } from 'lucide-react'

interface ToastProps {
    msg: string
    type: 'success' | 'error' | 'info'
    onClose: () => void
}

export const Toast = ({ msg, type, onClose }: ToastProps) => {
    useEffect(() => {
        const timer = setTimeout(onClose, 4000)
        return () => clearTimeout(timer)
    }, [onClose])

    return (
        <div style={{
            position: 'absolute',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: type === 'error' ? 'var(--danger-bg)' : 'var(--bg-card)',
            border: `1px solid ${type === 'error' ? 'var(--danger)' : 'var(--success)'}`,
            color: type === 'error' ? 'var(--danger)' : 'var(--success)',
            padding: '0.75rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            zIndex: 3000,
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            fontWeight: 500,
            fontSize: '0.9rem',
            animation: 'slideUp 0.3s ease'
        }}>
            {type === 'success' && <CheckCircle size={18} />}
            {type === 'error' && <AlertTriangle size={18} />}
            {msg}
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: '0.5rem', color: 'inherit', opacity: 0.7 }}><X size={14} /></button>
        </div>
    )
}
