
import React, { memo, useCallback, CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { History } from 'lucide-react';
import { Speedometer } from '../Speedometer';
import { useLogAnalyzerSettingsSafe } from '../../context';

export interface MachineData {
    mcId: number;
    mcNumber: number;
    ipAddress: string;
    isOnline: boolean;
    line: number;
    yield?: number;
}

export interface SmartMachineCardProps {
    machine: MachineData;
    onCardClick: (machine: MachineData) => void;
    onHistoryClick: (machine: MachineData) => void;
    isSelected?: boolean;
}

const CARD = {
    width: '100%', 
    minWidth: 180, 

    height: 180,
    borderRadius: 10,
    borderWidth: 2,
} as const;

const COLORS = {
    online: {
        border: 'linear-gradient(135deg, #4ade80, #22c55e, #16a34a)',
        accent: '#22c55e',
    },
    offline: {
        border: 'linear-gradient(135deg, #f87171, #ef4444, #dc2626)',
        accent: '#ef4444',
    },
    selected: {
        border: 'linear-gradient(135deg, #3b82f6, #60a5fa)',
        accent: '#3b82f6',
    },
    yield: {
        green: '#22c55e',
        yellow: '#f59e0b',
        red: '#ef4444',
    },
    history: '#3b82f6',
    historyHover: '#60a5fa',
} as const;

const TYPOGRAPHY = {
    mcNumber: { fontSize: '0.9rem', fontWeight: 700 },
    ipAddress: { fontSize: '0.75rem' },
    yieldLabel: { fontSize: '0.65rem' },
    yieldValue: { fontSize: '1.4rem', fontWeight: 700 },
    history: { fontSize: '0.75rem', fontWeight: 500 },
} as const;

const createStyles = (
    machine: MachineData,
    isSelected: boolean,
    isHovered: boolean
): Record<string, CSSProperties> => {
    const status = machine.isOnline ? COLORS.online : COLORS.offline;
    const borderGradient = isSelected ? COLORS.selected.border : status.border;
    const accentColor = isSelected ? COLORS.selected.accent : status.accent;

    return {
        wrapper: {
            width: CARD.width,
            height: CARD.height,
            background: borderGradient,
            padding: CARD.borderWidth,
            borderRadius: CARD.borderRadius,
            cursor: 'pointer',
            boxShadow: isHovered
                ? `0 4px 12px rgba(0,0,0,0.3), 0 0 6px ${status.accent}40`
                : '0 1px 4px rgba(0,0,0,0.2)',
            transition: 'box-shadow 0.2s ease',
        },
        inner: {
            width: '100%',
            height: '100%',
            background: 'var(--bg-card, #1e293b)',
            borderRadius: CARD.borderRadius - 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
        },
        header: {
            background: 'var(--bg-panel, rgba(100,116,139,0.25))',
            padding: '2px 4px',
            borderBottom: '1px solid var(--border, rgba(255,255,255,0.1))',
            textAlign: 'center',
            flexShrink: 0,
        },
        mcNumber: {
            ...TYPOGRAPHY.mcNumber,
            color: accentColor,
            textTransform: 'uppercase',
            letterSpacing: '0.03em',
            lineHeight: 1.2,
        },
        ipAddress: {
            ...TYPOGRAPHY.ipAddress,
            color: 'var(--text-main, #fff)',
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
        },
        
        speedometerHolder: {
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px',
            position: 'relative',
            minHeight: 0,
        },
        gaugeContainer: {
            flexShrink: 0,
            flex: '0 0 auto',
        },
        historyIcon: {
            position: 'absolute',
            top: 4,
            right: 4,
            color: COLORS.history,
            cursor: 'pointer',
            padding: 4,
            borderRadius: 6,
            background: 'rgba(59, 130, 246, 0.15)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color 0.2s, background 0.2s',
        },
    };
};

export const SmartMachineCard = memo(function SmartMachineCard({
    machine,
    onCardClick,
    onHistoryClick,
    isSelected = false,
}: SmartMachineCardProps) {
    const { getSegments } = useLogAnalyzerSettingsSafe();
    const segments = getSegments();
    const [isHovered, setIsHovered] = React.useState(false);

    const yieldValue = machine.yield ?? 0;
    const styles = createStyles(machine, isSelected, isHovered);

    const handleCardClick = useCallback(() => {
        onCardClick(machine);
    }, [onCardClick, machine]);

    const handleHistoryClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onHistoryClick(machine);
    }, [onHistoryClick, machine]);

    const handleMouseEnter = useCallback(() => setIsHovered(true), []);
    const handleMouseLeave = useCallback(() => setIsHovered(false), []);

    return (
        <motion.div
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.98 }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={handleCardClick}
            style={styles.wrapper}
            role="button"
            aria-label={`MC-${machine.mcNumber}, ${machine.isOnline ? 'Online' : 'Offline'}, Yield ${yieldValue.toFixed(1)}%`}
            tabIndex={0}
        >
            <div style={styles.inner}>
                {}
                <div style={styles.header}>
                    <div style={styles.mcNumber}>MC-{machine.mcNumber}</div>
                    <div style={styles.ipAddress}>{machine.ipAddress}</div>
                </div>

                {}
                <div style={styles.speedometerHolder}>
                    {}
                    <button
                        onClick={handleHistoryClick}
                        style={styles.historyIcon as CSSProperties}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.color = COLORS.historyHover;
                            e.currentTarget.style.background = 'rgba(59, 130, 246, 0.25)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.color = COLORS.history;
                            e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)';
                        }}
                        title="View History"
                    >
                        <History size={16} />
                    </button>

                    {}
                    <div style={styles.gaugeContainer}>
                        <Speedometer
                            value={yieldValue}
                            size={120}
                            strokeWidth={10}
                            segments={segments}
                            hideValue={false}
                            showTicks={false}
                            showValuePoints
                        />
                    </div>
                </div>
            </div>
        </motion.div>
    );
});

export default SmartMachineCard;
