/**
 * LineBlock - Compact bordered container for a Line and its Machines
 * 
 * Supports dark & light mode
 */
import React from 'react';
import { motion } from 'framer-motion';

// =============================================================================
// TYPES
// =============================================================================

export interface LineBlockProps {
    lineNumber: number;
    lineYield: number;
    children: React.ReactNode;
}

// =============================================================================
// COMPONENT
// =============================================================================

export const LineBlock: React.FC<LineBlockProps> = ({
    lineNumber,
    lineYield,
    children,
}) => {
    // Color based on yield threshold (matching new defaults: 85/95)
    const yieldColor = lineYield >= 95 ? '#22c55e' : lineYield >= 85 ? '#f59e0b' : '#ef4444';

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            style={{
                border: '1px solid var(--border, rgba(255, 255, 255, 0.12))',
                borderRadius: '6px',
                marginBottom: '10px',
                background: 'var(--bg-panel, rgba(255, 255, 255, 0.02))',
                overflow: 'hidden',
            }}
        >
            {/* Ultra-compact Line Header */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '4px 8px',
                    background: 'var(--bg-header, linear-gradient(90deg, rgba(59, 130, 246, 0.08), rgba(16, 185, 129, 0.08)))',
                    borderBottom: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
                }}
            >
                {/* Line Name - no badge */}
                <span
                    style={{
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        color: 'var(--text-main, #f1f5f9)',
                    }}
                >
                    Line {lineNumber}
                </span>

                {/* Yield Percentage with color */}
                <span
                    style={{
                        fontSize: '0.9rem',
                        fontWeight: 700,
                        color: yieldColor,
                    }}
                >
                    {lineYield.toFixed(1)}% Yield
                </span>
            </div>

            {/* Machine Cards Grid */}
            <div
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    padding: '8px',
                }}
            >
                {children}
            </div>
        </motion.div>
    );
};

export default LineBlock;
