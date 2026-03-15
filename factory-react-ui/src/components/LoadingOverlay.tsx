import React from 'react'
import { Loader2 } from 'lucide-react'

interface LoadingOverlayProps {
    message?: string
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ message = "Loading..." }) => {
    return (
        <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(255, 255, 255, 0.05)', 
            backdropFilter: 'blur(4px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200000, 
            borderRadius: 'var(--radius-md)',
            animation: 'fadeIn 0.3s ease'
        }}>
            <div style={{
                background: 'var(--bg-card)',
                padding: '1.5rem 2rem',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border)',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1rem'
            }}>
                <Loader2 className="spin" size={32} color="var(--primary)" />
                <span style={{
                    fontSize: '0.9rem',
                    fontWeight: 500,
                    color: 'var(--text-main)',
                    letterSpacing: '0.02em'
                }}>
                    {message}
                </span>
            </div>
            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .spin {
                    animation: spin 1s linear infinite;
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `}</style>
        </div>
    )
}
