/**
 * CompactMachineCard - Simple card for Log Analyzer mode
 * 
 * Displays only MC number and IP address, compact design.
 * Used when Yield mode is disabled.
 */
import { memo, useCallback } from 'react';
import { motion } from 'framer-motion';

// =============================================================================
// TYPES
// =============================================================================

export interface CompactMachineData {
    mcId: number;
    mcNumber: number;
    ipAddress: string;
    isOnline: boolean;
    line: number;
}

export interface CompactMachineCardProps {
    machine: CompactMachineData;
    onCardClick: (machine: CompactMachineData) => void;
    isSelected?: boolean;
}

// =============================================================================
// STYLES
// =============================================================================

const CARD = {
    width: 110,
    height: 50,
    borderRadius: 6,
} as const;

const COLORS = {
    online: '#22c55e',
    offline: '#ef4444',
    selected: '#3b82f6',
} as const;

// =============================================================================
// COMPONENT
// =============================================================================

export const CompactMachineCard = memo(function CompactMachineCard({
    machine,
    onCardClick,
    isSelected = false,
}: CompactMachineCardProps) {
    const borderColor = isSelected
        ? COLORS.selected
        : machine.isOnline
            ? COLORS.online
            : COLORS.offline;

    const handleClick = useCallback(() => {
        onCardClick(machine);
    }, [onCardClick, machine]);

    return (
        <motion.div
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleClick}
            style={{
                width: CARD.width,
                height: CARD.height,
                background: 'var(--bg-card, #1e293b)',
                border: `2px solid ${borderColor}`,
                borderRadius: CARD.borderRadius,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                transition: 'border-color 0.2s, box-shadow 0.2s',
            }}
            role="button"
            aria-label={`MC-${machine.mcNumber}, ${machine.isOnline ? 'Online' : 'Offline'}`}
            tabIndex={0}
        >
            {/* MC Number */}
            <div
                style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: borderColor,
                    textTransform: 'uppercase',
                    letterSpacing: '0.03em',
                }}
            >
                MC-{machine.mcNumber}
            </div>

            {/* IP Address */}
            <div
                style={{
                    fontSize: '0.6rem',
                    color: 'var(--text-main, #fff)',
                    marginTop: 2,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '100%',
                }}
            >
                {machine.ipAddress}
            </div>
        </motion.div>
    );
});

export default CompactMachineCard;
