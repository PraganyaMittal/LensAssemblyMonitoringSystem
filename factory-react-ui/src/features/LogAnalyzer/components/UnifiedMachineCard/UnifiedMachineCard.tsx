/**
 * UnifiedMachineCard - Square card with always-on yield display
 * 
 * Matches original color scheme with:
 * - Square shape (~110px)
 * - Gradient background with status glow
 * - Colored header bar
 * - Horizontal yield + history footer
 */
import React, { memo, useCallback, CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { History } from 'lucide-react';
import { useLogAnalyzerSettingsSafe, useAlerts } from '../../context';

// =============================================================================
// TYPES
// =============================================================================

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

// =============================================================================
// STYLE CONSTANTS (matching main branch)
// =============================================================================

const COLORS = {
    online: {
        border: 'var(--success, #34d399)',
        glow: 'rgba(52, 211, 153, 0.15)',
        headerBg: 'linear-gradient(135deg, rgba(52, 211, 153, 0.2), rgba(52, 211, 153, 0.1))',
    },
    offline: {
        border: 'var(--danger, #f87171)',
        glow: 'rgba(248, 113, 113, 0.15)',
        headerBg: 'linear-gradient(135deg, rgba(248, 113, 113, 0.2), rgba(248, 113, 113, 0.1))',
    },
    yield: {
        green: '#22c55e',
        yellow: '#f59e0b',
        red: '#ef4444',
    },
} as const;

// Opacity variable for yield pill background (0 to 1, where 1 = 100%)
const YIELD_BG_OPACITY = 0.5;

// =============================================================================
// HELPERS
// =============================================================================

const getYieldColor = (value: number, redThreshold: number, yellowThreshold: number): string => {
    if (value >= yellowThreshold) return COLORS.yield.green;
    if (value >= redThreshold) return COLORS.yield.yellow;
    return COLORS.yield.red;
};

// =============================================================================
// COMPONENT
// =============================================================================

export const UnifiedMachineCard = memo(function UnifiedMachineCard({
    machine,
    onCardClick,
    onYieldClick,
    onHistoryClick,
}: UnifiedMachineCardProps) {
    const { settings } = useLogAnalyzerSettingsSafe();

    const yieldValue = machine.yield ?? 0;
    const yieldColor = getYieldColor(yieldValue, settings.redThreshold, settings.yellowThreshold);

    const status = machine.isOnline ? COLORS.online : COLORS.offline;

    // Alert Logic
    const { alerts } = useAlerts();
    const activeAlert = alerts.find(a => a.machineId === machine.mcId && a.isActive);

    // Override border/glow if there is an active alert -> DISABLED per user request for "Clean" look
    // const effectiveBorder = activeAlert ? COLORS.yield.red : status.border;
    // const effectiveGlow = activeAlert ? 'rgba(239, 68, 68, 0.4)' : status.glow;
    const effectiveBorder = status.border;
    const effectiveGlow = status.glow;


    // Handlers
    const handleCardClick = useCallback(() => {
        onCardClick(machine);
    }, [onCardClick, machine]);

    const handleYieldClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onYieldClick(machine);
    }, [onYieldClick, machine]);

    const handleHistoryClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onHistoryClick(machine);
    }, [onHistoryClick, machine]);

    // Card styles matching original design
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
        boxShadow: `0 2px 8px ${effectiveGlow}`,
        transition: 'box-shadow 0.2s ease',
        overflow: 'hidden',
    };

    const headerStyle: CSSProperties = {
        padding: '0.25rem',
        fontSize: '0.65rem',
        fontWeight: 700,
        color: 'white',
        background: status.headerBg,
        borderBottom: `1px solid ${status.border}`,
        textAlign: 'center',
        textTransform: 'uppercase',
    };

    // statusDotStyle and alertDotStyle removed as they are unused/inline now

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
        background: 'rgba(0, 0, 0, 0.2)',
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
    };

    // Convert hex color to rgba with controllable opacity
    const hexToRgba = (hex: string, opacity: number) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    };

    const yieldBgColor = hexToRgba(yieldColor, YIELD_BG_OPACITY);
    const yieldBgColorHover = hexToRgba(yieldColor, Math.min(YIELD_BG_OPACITY + 0.15, 1));

    const yieldPillStyle: CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        padding: '2px 4px',
        borderRadius: '4px',
        background: yieldBgColor,
        border: `1px solid ${yieldColor}`,
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
        background: 'rgba(59, 130, 246, 0.15)',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--text-dim, #94a3b8)',
        transition: 'all 0.2s',
        flexShrink: 0,
    };

    return (
        <motion.div
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleCardClick}
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

            {/* Alert Dot (Top Right - Blinking) - Replaces Status Dot per user request */}
            {activeAlert && <div style={{
                position: 'absolute',
                top: 4,
                right: 4, // Moved to Right
                width: 10, // Slightly larger
                height: 10,
                borderRadius: '50%',
                background: '#ef4444',
                boxShadow: '0 0 8px #ef4444',
                zIndex: 11,
                animation: 'pulse-red 1.5s infinite',
            }} />}

            {/* Status Dot REMOVED per user request */}

            {/* Header - MC Number */}
            <div style={headerStyle}>
                MC-{machine.mcNumber}
            </div>

            {/* Body - IP Address */}
            <div style={bodyStyle}>
                <div style={ipStyle}>{machine.ipAddress}</div>
            </div>

            {/* Footer - Yield + History (Horizontal) */}
            <div style={footerStyle}>
                {/* Yield Pill */}
                <div
                    style={yieldPillStyle}
                    onClick={handleYieldClick}
                    onMouseEnter={(e) => e.currentTarget.style.background = yieldBgColorHover}
                    onMouseLeave={(e) => e.currentTarget.style.background = yieldBgColor}
                    title="View Yield Analytics"
                >
                    <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#fff' }}>
                        Yield: {yieldValue.toFixed(1)}%
                    </span>
                </div>

                {/* History Icon */}
                <button
                    style={historyBtnStyle}
                    onClick={handleHistoryClick}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(59, 130, 246, 0.3)';
                        e.currentTarget.style.color = '#3b82f6';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)';
                        e.currentTarget.style.color = 'var(--text-dim, #94a3b8)';
                    }}
                    title="View History"
                    aria-label="View yield history"
                >
                    <History size={12} />
                </button>
            </div>
        </motion.div>
    );
});

export default UnifiedMachineCard;
