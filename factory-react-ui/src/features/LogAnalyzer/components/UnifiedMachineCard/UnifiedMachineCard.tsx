
import React, { memo, useCallback, CSSProperties, useState } from 'react';
import { motion } from 'framer-motion';
import { History } from 'lucide-react';
import { useLogAnalyzerSettingsSafe, useAlerts } from '../../context';

export interface UnifiedMachineData {
    mcId: number;
    mcNumber: number;
    ipAddress: string;
    isOnline: boolean;
    line: number;
    yield?: number;
}

export interface UnifiedMachineCardProps {
    machine: UnifiedMachineData;
    onCardClick: (machine: UnifiedMachineData) => void;
    onYieldClick: (machine: UnifiedMachineData) => void;
    onHistoryClick: (machine: UnifiedMachineData) => void;
    isSelected?: boolean;
}

const getYieldStyle = (value: number, redThreshold: number, yellowThreshold: number) => {
    if (value >= yellowThreshold) {
        return {
            color: 'var(--success)',
            bg: 'var(--bg-hover)',
            border: 'var(--border-subtle)'
        };
    }
    if (value >= redThreshold) {
        return {
            color: 'var(--warning)',
            bg: 'var(--bg-hover)', 
            border: 'var(--border-subtle)'
        };
    }
    return {
        color: 'var(--danger)',
        bg: 'var(--bg-hover)',
        border: 'var(--border-subtle)'
    };
};

export const UnifiedMachineCard = memo(function UnifiedMachineCard({
    machine,
    onCardClick,
    onYieldClick,
    onHistoryClick,
}: UnifiedMachineCardProps) {
    const { settings } = useLogAnalyzerSettingsSafe();
    const [isFooterHovered, setIsFooterHovered] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const shouldScale = isHovered && !isFooterHovered;

    const yieldValue = machine.yield ?? 0;
    const yieldStyle = getYieldStyle(yieldValue, settings.redThreshold, settings.yellowThreshold);

    const statusColor = machine.isOnline ? 'var(--success)' : 'var(--text-muted)';
    const statusBg = machine.isOnline ? 'var(--success-bg)' : 'var(--bg-hover)';

    const headerBg = `linear-gradient(135deg, ${statusBg}, transparent)`;

    const { alerts } = useAlerts();
    const hasUnreadAlert = alerts.some(a => a.machineId === machine.mcId && !a.isAcknowledged);

    const effectiveBorder = machine.isOnline ? statusColor : 'var(--danger)';
    const effectiveGlow = statusBg;

    const handleCardClick = useCallback(() => {
        onCardClick(machine);
    }, [onCardClick, machine]);

    const handleYieldClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onYieldClick(machine);
    }, [onYieldClick, machine]);

    const cardStyle: CSSProperties = {
        position: 'relative',
        width: '100%',
        minWidth: 100,
        aspectRatio: '1 / 0.7',
        background: `linear-gradient(135deg, ${effectiveGlow}, var(--bg-card, #1e293b))`,
        border: `1px solid ${effectiveBorder}`,
        borderRadius: 5,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: isHovered ? `0 8px 20px ${effectiveGlow}, 0 0 0 1px ${effectiveBorder}` : `0 2px 8px ${effectiveGlow}`,
        transition: 'box-shadow 0.2s ease',
        overflow: 'hidden',
    };

    const headerStyle: CSSProperties = {
        padding: '0.25rem',
        fontSize: '0.65rem',
        fontWeight: 700,
        background: headerBg,
        color: statusColor,
        borderBottom: `1px solid ${effectiveBorder}`,
        textAlign: 'center',
        textTransform: 'uppercase',
    };

    const bodyStyle: CSSProperties = {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '0.25rem',
    };

    const ipStyle: CSSProperties = {
        fontSize: '0.65rem',
        fontWeight: 600,
        color: 'var(--text-main, #fff)',
        textAlign: 'center',
        lineHeight: 1.2,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: '100%',
    };

    const footerStyle: CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '3px 4px',
        background: 'var(--bg-surface, rgba(0, 0, 0, 0.2))',
        borderTop: '1px solid var(--border-subtle)',
    };

    const yieldPillStyle: CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        padding: '2px 4px',
        borderRadius: '4px',
        background: yieldStyle.bg,
        border: `1px solid ${yieldStyle.border}`,
        cursor: 'pointer',
        transition: 'all 0.2s',
        whiteSpace: 'nowrap',
    };

    const historyBtnStyle: CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2px',
        borderRadius: '3px',
        background: 'rgba(56, 189, 248, 0.05)', 
        border: '1px solid transparent',
        cursor: 'pointer',
        color: 'var(--primary)',
        transition: 'all 0.2s',
        flexShrink: 0,
    };

    return (
        <motion.div
            animate={{ scale: shouldScale ? 1.02 : 1, y: shouldScale ? -2 : 0 }}
            transition={{ type: 'tween', duration: 0.15 }}
            whileTap={!isFooterHovered ? { scale: 0.98 } : undefined}
            onClick={handleCardClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => { setIsHovered(false); setIsFooterHovered(false); }}
            style={cardStyle}
            role="button"
            aria-label={`MC-${machine.mcNumber}, ${machine.isOnline ? 'Online' : 'Offline'}, Yield ${yieldValue.toFixed(1)}%`}
            tabIndex={0}
        >
            <style>{`
                @keyframes pulse-red {
                    0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
                    70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
                    100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
                }
            `}</style>

            {}
            {hasUnreadAlert && <div style={{
                position: 'absolute',
                top: 4,
                right: 4, 
                width: 10, 
                height: 10,
                borderRadius: '50%',
                background: '#ef4444',
                boxShadow: '0 0 8px #ef4444',
                zIndex: 11,
                animation: 'pulse-red 1.5s infinite',
            }} />}

            {}

            {}
            <div style={headerStyle}>
                MC-{machine.mcNumber}
            </div>

            {}
            <div style={bodyStyle}>
                <div style={ipStyle}>{machine.ipAddress}</div>
            </div>

            {}
            <div
                style={footerStyle}
                onMouseEnter={() => setIsFooterHovered(true)}
                onMouseLeave={() => setIsFooterHovered(false)}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()} 
            >
                {}
                <motion.div
                    style={yieldPillStyle}
                    onClick={handleYieldClick}
                    onPointerDown={(e) => e.stopPropagation()}
                    whileTap={{ scale: 0.9 }}

                    onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(0.95)'}
                    onMouseLeave={(e) => e.currentTarget.style.filter = 'none'}
                    title="View Yield Analytics"
                >
                    <span style={{ fontSize: '0.6rem', fontWeight: 700, color: yieldStyle.color }}>
                        Yld: {yieldValue.toFixed(1)}%
                    </span>
                </motion.div>

                {}
                <motion.button
                    style={historyBtnStyle}
                    onClick={(e) => {
                        e.stopPropagation();
                        onHistoryClick(machine);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    whileTap={{ scale: 0.9 }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(56, 189, 248, 0.25)'; 
                        e.currentTarget.style.color = 'var(--primary)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(56, 189, 248, 0.05)'; 
                        e.currentTarget.style.color = 'var(--primary)';
                    }}
                    title="View History"
                    aria-label="View yield history"
                >
                    <History size={14} />
                </motion.button>
            </div>
        </motion.div>
    );
});

export default UnifiedMachineCard;
