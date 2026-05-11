import { Circle } from 'lucide-react'
import type { LensAssemblyPC } from '../types'

interface Props {
    pc: LensAssemblyPC
    onClick: (pc: LensAssemblyPC) => void
    showVersion?: boolean  
}

export default function MCCard({ pc, onClick, showVersion = false }: Props) {
    const isDecommissioning = pc.lifecycleState === 'PendingDecommission';
    
    const statusColor = pc.isOnline ? 'var(--success)' : 'var(--text-muted)';
    const statusBg = pc.isOnline ? 'var(--success-bg)' : 'var(--bg-hover)';
    const headerBg = `linear-gradient(135deg, ${statusBg}, transparent)`;
    const effectiveBorder = pc.isOnline ? statusColor : 'var(--danger)';
    const effectiveGlow = statusBg;

    const cardGradient = `linear-gradient(135deg, ${effectiveGlow}, var(--bg-card, #1e293b))`;

    const getPillStyle = (isUp: boolean) => ({
        color: isUp ? 'var(--success)' : 'var(--danger)',
        bg: 'var(--bg-hover)',
        border: 'var(--border-subtle)'
    });

    const agentPill = getPillStyle(pc.isOnline);
    const appPill = getPillStyle(pc.isApplicationRunning);

    return (
        <div
            className="mc-card-aesthetic"
            onClick={() => onClick(pc)}
            style={{
                position: 'relative',
                width: '100%',
                background: cardGradient,
                border: `1px solid ${effectiveBorder}`,
                borderRadius: '5px',
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: `0 2px 8px ${effectiveGlow}`,
                overflow: 'hidden',
                opacity: isDecommissioning ? 0.6 : 1,
                pointerEvents: isDecommissioning ? 'none' : 'auto'
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)'
                e.currentTarget.style.boxShadow = `0 8px 20px ${effectiveGlow}, 0 0 0 1px ${effectiveBorder}`
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)'
                e.currentTarget.style.boxShadow = `0 2px 8px ${effectiveGlow}`
            }}
        >
            {}

            {}
            <div style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                color: statusColor,
                textAlign: 'center',
                padding: '0.25rem',
                background: headerBg,
                borderBottom: `1px solid ${effectiveBorder}`,
                textTransform: 'uppercase'
            }}>
                MC-{pc.mcNumber}
                {isDecommissioning && (
                    <span style={{
                        display: 'block',
                        fontSize: '0.5rem',
                        color: 'var(--warning)',
                        marginTop: '2px',
                        animation: 'pulse 2s infinite'
                    }}>
                        Decommissioning...
                    </span>
                )}
            </div>

            {}
            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '0.25rem',
            }}>
                <div style={{
                    fontSize: '0.7rem',
                    fontWeight: 500,
                    color: 'var(--text-main)',
                    textAlign: 'center',
                    letterSpacing: '-0.02em',
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '100%'
                }}>
                    {pc.ipAddress}
                </div>
            </div>

            {}
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '2px', 
                padding: '3px 4px',
                background: 'var(--bg-surface, rgba(0, 0, 0, 0.2))',
                borderTop: '1px solid var(--border-subtle)',
            }}>
                {}
                {showVersion && (
                    <div className="text-mono" style={{
                        fontSize: '0.55rem',
                        fontWeight: 700,
                        color: 'var(--primary)',
                        textAlign: 'center',
                        letterSpacing: '0.02em',
                        opacity: 0.8,
                        cursor: 'default',
                        transition: 'opacity 0.2s',
                        width: '100%',
                        lineHeight: 1,
                        paddingBottom: '2px' 
                    }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}>
                        {pc.modelVersion}
                    </div>
                )}

                {}
                <div style={{
                    display: 'flex',
                    gap: '2px', 
                    justifyContent: 'space-between',
                    width: '100%'
                }}>
                    {}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.15rem',
                        padding: '1px 3px', 
                        borderRadius: '3px', 
                        background: agentPill.bg,
                        border: `1px solid ${agentPill.border}`,
                        fontSize: '0.5rem',
                        fontWeight: 700,
                        letterSpacing: '0.02em',
                        whiteSpace: 'nowrap'
                    }}>
                        <Circle size={4} fill={agentPill.color} strokeWidth={0} />
                        <span style={{ color: agentPill.color }}>Agent</span>
                    </div>

                    {}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.15rem',
                        padding: '1px 3px',
                        borderRadius: '3px',
                        background: appPill.bg,
                        border: `1px solid ${appPill.border}`,
                        fontSize: '0.5rem',
                        fontWeight: 700,
                        letterSpacing: '0.02em',
                        whiteSpace: 'nowrap'
                    }}>
                        <Circle size={4} fill={appPill.color} strokeWidth={0} />
                        <span style={{ color: appPill.color }}>App</span>
                    </div>
                </div>
            </div>

        </div>
    )
}
